import http from 'node:http'
import { createPool } from 'mysql2/promise'

http.createServer(async (req, res) => {
	const urlParams = req.url.split('/').slice(1)

	if (urlParams[0] === 'clientes') {
		const id = urlParams[1]

		if (id && id.match(/^\d+$/) && id > 0 && id < 6) {
			if (urlParams[2] === 'extrato' && req.method === 'GET') {
				clientes.extrato(id).then(({ code, data }) => {
					res.writeHead(code, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify(data))
				})
			} else if (urlParams[2] === 'transacoes' && req.method === 'POST') {
				let body = ''

				for await (const chunk of req) body += chunk

				clientes.transacoes(id, JSON.parse(body)).then(({ code, data }) => {
					res.writeHead(code, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify(data))
				})
			} else {
				res.writeHead(404, { 'Content-Type': 'text/plain' })
				res.end('')
			}
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain' })
			res.end('')
		}
	} else {
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('')
	}
}).listen(process.env.PORT, () => console.log('Server running at ' + process.env.PORT))

const pool = createPool({
	host: 'db',
	user: 'root',
	password: 'adminPass',
	database: 'rinha',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
})

const clientes = {
	async transacoes(id, data) {
		if (data.valor < 0 || parseInt(data.valor) != data.valor) return { code: 422, data: null }
		if (!['c', 'd'].includes(data.tipo)) return { code: 422, data: null }
		if (!data.descricao || data.descricao.length === 0 || data.descricao.length > 10) return { code: 422, data: null }

		const conn = await pool.getConnection()
		const [[cliente]] = await conn.query('SELECT saldo, limite FROM clientes WHERE id = ?', [id])

		if (data.tipo === 'c') cliente.saldo += +data.valor
		else {
			cliente.saldo -= data.valor

			if (cliente.saldo < -cliente.limite) {
				conn.release()
				return { code: 422, data: null }
			}
		}

		await conn.query('INSERT INTO transacoes (cliente_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)', [id, data.tipo, data.valor, data.descricao])
		await conn.query('UPDATE clientes SET saldo = ? WHERE id = ?', [cliente.saldo, id])

		conn.release()

		return {
			code: 200,
			data: {
				limite: cliente.limite,
				saldo: cliente.saldo,
			},
		}
	},
	async extrato(id) {
		const conn = await pool.getConnection()
		const [[cliente]] = await conn.query('SELECT * FROM clientes WHERE id = ?', [id])
		const [transacoes] = await conn.query('SELECT * FROM transacoes WHERE cliente_id = ? ORDER BY ID DESC LIMIT 10', [id])
		conn.release()

		return {
			code: 200,
			data: {
				saldo: {
					total: cliente.saldo,
					data_extrato: new Date().toISOString(),
					limite: cliente.limite
				},
				ultimas_transacoes: transacoes,
			},
		}
	},
}
