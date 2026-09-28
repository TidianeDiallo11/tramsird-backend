const axios = require("axios");

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email non configure - RESEND_API_KEY manquant] A: ${to} | Sujet: ${subject}\n${html}`);
    return { skipped: true };
  }

  const response = await axios.post(
    "https://api.resend.com/emails",
    {
      from: process.env.EMAIL_FROM || "Tramsird <onboarding@resend.dev>",
      to,
      subject,
      html,
    },
    { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" } }
  );

  return response.data;
}

module.exports = { sendEmail };
