const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
require('dotenv').config()
const nodemailer = require('nodemailer')

const isDev = process.env.VITE_DEV_SERVER_URL

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

const sendMail = async ({ to, link }) => {
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
}

ipcMain.handle('mail:send', async (_event, payload) => {
  await sendMail(payload)
  return true
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

