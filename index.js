const net = require('net')
const WebSocket = require('ws')

const logcb = () => () => {}
const errcb = () => () => {}

const ppua = '6a3b62e21368494db4d77d557c53baaa'
const port = process.env.PORT||58106
const wss = new WebSocket.Server({ port }, logcb('listen:', port))

wss.on('connection', (ws) => {
  let duplex, targetConnection
  const cleanup = () => {
    if (duplex) {
      duplex.destroy() 
    }
    if (targetConnection) {
      targetConnection.end() 
    }
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
        duplex
          .on('error', errcb('E1:'))
          .pipe(this)
          .on('error', errcb('E2:'))
          .pipe(duplex)
      })
      .on('error', errcb('Conn-Err:', { host, port: targetPort }))

    targetConnection.on('close', cleanup)
  }).on('error', errcb('EE:'))

  ws.on('close', cleanup)
})
