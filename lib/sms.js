// Envoi de SMS — module volontairement "branchable".
//
// Aucun fournisseur n'envoie de vrais SMS gratuitement à n'importe quel
// numéro : Twilio/Vonage proposent un petit crédit d'essai gratuit au
// départ, mais il faut un compte (carte bancaire de vérification en
// général) puis ça devient payant à l'usage.
//
// Tant qu'aucun fournisseur n'est configuré dans .env, ce module tourne
// en "mode simulation" : le SMS n'est pas réellement envoyé, le code est
// juste affiché dans les logs du serveur (et renvoyé dans la réponse API
// UNIQUEMENT si SMS_DEBUG_EXPOSE_CODE=true, pratique pour tester en local
// sans dépenser un centime). Il suffit de renseigner les variables d'un
// des fournisseurs ci-dessous pour passer à l'envoi réel, sans toucher
// au reste du code (routes/auth.js).

async function sendSms(to, message) {
  const provider = (process.env.SMS_PROVIDER || 'simulate').toLowerCase();

  if (provider === 'twilio') {
    return sendViaTwilio(to, message);
  }
  if (provider === 'vonage') {
    return sendViaVonage(to, message);
  }

  // --- Mode simulation (par défaut, gratuit) ---
  console.log(`\n📱 [SMS simulé] À: ${to}\n   Message: ${message}\n`);
  return { simulated: true };
}

async function sendViaTwilio(to, message) {
  // npm install twilio
  // .env : SMS_PROVIDER=twilio, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER, body: message });
  return { simulated: false };
}

async function sendViaVonage(to, message) {
  // npm install @vonage/server-sdk
  // .env : SMS_PROVIDER=vonage, VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM_NAME
  const { Vonage } = require('@vonage/server-sdk');
  const vonage = new Vonage({ apiKey: process.env.VONAGE_API_KEY, apiSecret: process.env.VONAGE_API_SECRET });
  await vonage.sms.send({ to, from: process.env.VONAGE_FROM_NAME || 'DZCarrosse', text: message });
  return { simulated: false };
}

module.exports = { sendSms };
