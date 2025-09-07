const http = require('http')
const net = require('net')
const WebSocket = require('ws')

const ppua = '6a3b62e21368494db4d77d557c53baaa'
const port = parseInt(process.env.LEANCLOUD_APP_PORT || process.env.PORT || 3000)

// 创建 HTTP server，用于接收所有请求
const server = http.createServer((req, res) => {
  // 如果没有 upgrade 请求，就直接返回 200
  res.writeHead(200)
  res.end()
})

// 只接管 upgrade
const wss = new WebSocket.Server({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  let duplex, targetConnection
  const cleanup = () => {
    if (duplex) duplex.destroy()
    if (targetConnection) targetConnection.end()
    ws.terminate()
  }

  ws.once('message', (msg) => {
    const [VERSION] = msg
    const id = msg.slice(1, 17)

    if (!id.every((v, i) => v === parseInt(ppua.substr(i * 2, 2), 16))) {
      ws.close()
      return
    }

    let i = msg.slice(17, 18).readUInt8() + 19
    const targetPort = msg.slice(i, (i += 2)).readUInt16BE(0)
    const ATYP = msg.slice(i, (i += 1)).readUInt8()
    const host =
      ATYP === 1
        ? msg.slice(i, (i += 4)).join('.')
        : ATYP === 2
        ? new TextDecoder().decode(
            msg.slice(i + 1, (i += 1 + msg.slice(i, i + 1).readUInt8()))
          )
        : ATYP === 3
        ? msg
            .slice(i, (i += 16))
            .reduce(
              (s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s),
              []
            )
            .map((b) => b.readUInt16BE(0).toString(16))
            .join(':')
        : ''

    ws.send(new Uint8Array([VERSION, 0]))

    duplex = WebSocket.createWebSocketStream(ws)

    targetConnection = net
      .connect({ host, port: targetPort }, function () {
        this.write(msg.slice(i))
        duplex.pipe(this).pipe(duplex)
      })
      .on('error', (err) => {
        console.error('Conn-Err:', { host, port: targetPort }, err)
        cleanup()
      })

    targetConnection.on('close', cleanup)
  }).on('error', (err) => {
    console.error('EE:', err)
  })

  ws.on('close', cleanup)
})

server.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
