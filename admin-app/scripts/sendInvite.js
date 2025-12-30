// Tek seferlik mail gönderimi için: npm run send:invite -- --to hedef@ornek.com --link https://your-app.web.app
import 'dotenv/config'
import nodemailer from 'nodemailer'

const args = process.argv.slice(2)
const toIndex = args.indexOf('--to')
const linkIndex = args.indexOf('--link')
const to = toIndex >= 0 ? args[toIndex + 1] : null
const link = linkIndex >= 0 ? args[linkIndex + 1] : 'https://your-app.web.app'

if (!to) {
  console.error('Kullanım: npm run send:invite -- --to hedef@mail.com --link https://...')
  process.exit(1)
}

async function main() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Your App'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject: 'Your App daveti',
    text: `Merhaba,\n\nDavet bağlantınız: ${link}\n\nSelamlar,\nYour App`,
    html: `<p>Merhaba,</p><p>Davet bağlantınız: <a href="${link}">${link}</a></p><p>Selamlar,<br/>Your App</p>`,
  })

  console.log('Gönderildi ->', to)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})










