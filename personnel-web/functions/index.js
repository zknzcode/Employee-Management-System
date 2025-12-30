const functions = require('firebase-functions')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')

if (!admin.apps.length) {
  admin.initializeApp()
}

// Prefer env vars; fallback to functions config
const cfg = (() => {
  try {
    const c = require('firebase-functions').config()
    return c.smtp || {}
  } catch (e) {
    return {}
  }
})()

const smtp = {
  host: process.env.SMTP_HOST || cfg.host || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || cfg.port || 587),
  user: process.env.SMTP_USER || cfg.user || 'your-email@example.com',
  pass: process.env.SMTP_PASS || cfg.pass || 'YOUR_APP_PASSWORD',
  from: process.env.SMTP_FROM || cfg.from || 'Your App <your-email@example.com>',
}

let transporter
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: false,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    })
  }
  return transporter
}

exports.sendInvite = functions
  .region('us-central1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    const emailClaim = context.auth?.token?.email
    const isAdminClaim = context.auth?.token?.role === 'admin' || context.auth?.token?.admin === true
    // TODO: Replace with your admin whitelist
    const whitelist = [] // Add your admin emails here
    const uidWhitelist = [] // Add your admin UIDs here
    const isWhitelisted = (emailClaim && whitelist.includes(emailClaim)) || (context.auth?.uid && uidWhitelist.includes(context.auth.uid))
    if (!context.auth || (!isAdminClaim && !isWhitelisted)) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required')
    }

    const to = data?.to
    const link = data?.link || 'https://your-app.web.app'
    if (!to) {
      throw new functions.https.HttpsError('invalid-argument', 'to required')
    }
    if (!smtp.user || !smtp.pass) {
      logger.error('SMTP credentials missing')
      throw new functions.https.HttpsError('failed-precondition', 'SMTP not configured')
    }

    await getTransporter().sendMail({
      from: smtp.from || smtp.user,
      to,
      subject: 'Your App - Einladung zur Registrierung',
      text: `Sie wurden zu Your App eingeladen. Bitte registrieren Sie sich hier: ${link}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00a4e4;">Your App</h2>
          <p>Guten Tag,</p>
          <p>Sie wurden zur Your App Personal-App eingeladen.</p>
          <p>Bitte klicken Sie auf den folgenden Link, um sich zu registrieren:</p>
          <p style="margin: 20px 0;">
            <a href="${link}" style="background: #00a4e4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Jetzt registrieren
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">Oder kopieren Sie diesen Link: ${link}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 11px;">Your App Service</p>
        </div>
      `,
    })

    return { ok: true }
  })

