// Traductions des messages renvoyés par l'API (erreurs de validation, SMS,
// libellés de secours...). Miroir côté serveur de public/js/i18n.js — les
// deux sont volontairement séparés (l'un tourne dans le navigateur, l'autre
// dans Node) mais suivent la même logique : dictionnaire par langue + t().
const SUPPORTED_LANGS = ['fr', 'en', 'ar'];
const DEFAULT_LANG = 'fr';

const MESSAGES = {
  fr: {
    'auth.registerRequired': 'Identifiant, mot de passe, nom et téléphone sont obligatoires.',
    'auth.usernameFormat': "L'identifiant doit contenir 3 à 32 caractères : lettres, chiffres, ., _ ou -.",
    'auth.passwordLength': 'Le mot de passe doit contenir au moins 8 caractères.',
    'auth.nameOrPhoneTooLong': 'Nom ou téléphone trop long.',
    'auth.phoneInvalid': 'Merci de saisir un numéro de téléphone valide.',
    'auth.wilayaRequired': 'Merci de choisir la wilaya du concessionnaire dans la liste.',
    'auth.emailInvalid': 'Adresse email invalide.',
    'auth.usernameTaken': 'Cet identifiant est déjà utilisé.',
    'auth.usernameTakenOther': 'Cet identifiant est déjà utilisé par un autre compte.',
    'auth.emailTaken': 'Cette adresse email est déjà utilisée.',
    'auth.loginFailed': 'Identifiant ou mot de passe incorrect.',
    'auth.notLoggedIn': 'Vous devez être connecté.',
    'auth.wrongAccountType': 'Accès réservé à un autre type de compte.',
    'auth.accountNotFound': 'Compte introuvable.',
    'auth.currentPasswordWrong': 'Mot de passe actuel incorrect.',
    'auth.dealerRequired': 'Identifiant, mot de passe et nom sont obligatoires.',
    'auth.adminAccountsNotManaged': 'Les comptes administrateur ne se gèrent pas depuis cette interface.',
    'auth.adminAccountsNotDeleted': 'Les comptes administrateur ne se suppriment pas depuis cette interface.',
    'car.notFound': 'Véhicule introuvable.',
    'car.otherDealer': 'Ce véhicule appartient à un autre concessionnaire.',
    'car.requiredFields': 'Merci de remplir tous les champs obligatoires.',
    'car.defaultDealerName': 'Concessionnaire',
    'request.notFound': 'Annonce introuvable.',
    'request.otherUser': 'Cette annonce appartient à un autre utilisateur.',
    'request.requiredFields': 'Merci de remplir tous les champs obligatoires.',
    'request.defaultOwnerName': 'Particulier',
    'upload.badType': 'Seules les images (jpg, png, webp, gif) sont acceptées.',
    'upload.tooLarge': 'Cette image dépasse la taille maximale autorisée (6 Mo).',
    'generic.rateLimited': 'Trop de requêtes, merci de réessayer plus tard.',
    'generic.authRateLimited': 'Trop de tentatives, merci de réessayer plus tard.',
    'generic.routeNotFound': 'Route introuvable.',
    'generic.serverError': 'Erreur interne du serveur.'
  },
  en: {
    'auth.registerRequired': 'Username, password, name and phone are required.',
    'auth.usernameFormat': 'The username must be 3 to 32 characters: letters, digits, ., _ or -.',
    'auth.passwordLength': 'The password must be at least 8 characters.',
    'auth.nameOrPhoneTooLong': 'Name or phone number too long.',
    'auth.phoneInvalid': 'Please enter a valid phone number.',
    'auth.wilayaRequired': 'Please choose the dealer’s wilaya from the list.',
    'auth.emailInvalid': 'Invalid email address.',
    'auth.usernameTaken': 'This username is already taken.',
    'auth.usernameTakenOther': 'This username is already used by another account.',
    'auth.emailTaken': 'This email address is already in use.',
    'auth.loginFailed': 'Incorrect username or password.',
    'auth.notLoggedIn': 'You must be logged in.',
    'auth.wrongAccountType': 'Access restricted to a different account type.',
    'auth.accountNotFound': 'Account not found.',
    'auth.currentPasswordWrong': 'Incorrect current password.',
    'auth.dealerRequired': 'Username, password and name are required.',
    'auth.adminAccountsNotManaged': 'Administrator accounts cannot be managed from this interface.',
    'auth.adminAccountsNotDeleted': 'Administrator accounts cannot be deleted from this interface.',
    'car.notFound': 'Vehicle not found.',
    'car.otherDealer': 'This vehicle belongs to another dealer.',
    'car.requiredFields': 'Please fill in all required fields.',
    'car.defaultDealerName': 'Dealer',
    'request.notFound': 'Listing not found.',
    'request.otherUser': 'This listing belongs to another user.',
    'request.requiredFields': 'Please fill in all required fields.',
    'request.defaultOwnerName': 'Individual',
    'upload.badType': 'Only images (jpg, png, webp, gif) are accepted.',
    'upload.tooLarge': 'This image exceeds the maximum allowed size (6 MB).',
    'generic.rateLimited': 'Too many requests, please try again later.',
    'generic.authRateLimited': 'Too many attempts, please try again later.',
    'generic.routeNotFound': 'Route not found.',
    'generic.serverError': 'Internal server error.'
  },
  ar: {
    'auth.registerRequired': 'اسم المستخدم وكلمة المرور والاسم والهاتف كلها إلزامية.',
    'auth.usernameFormat': 'يجب أن يتكون اسم المستخدم من 3 إلى 32 حرفًا: أحرف، أرقام، . أو _ أو -.',
    'auth.passwordLength': 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
    'auth.nameOrPhoneTooLong': 'الاسم أو رقم الهاتف طويل جدًا.',
    'auth.phoneInvalid': 'يرجى إدخال رقم هاتف صالح.',
    'auth.wilayaRequired': 'يرجى اختيار ولاية الوكيل من القائمة.',
    'auth.emailInvalid': 'عنوان البريد الإلكتروني غير صالح.',
    'auth.usernameTaken': 'اسم المستخدم هذا مستخدَم بالفعل.',
    'auth.usernameTakenOther': 'اسم المستخدم هذا مستخدَم بالفعل من طرف حساب آخر.',
    'auth.emailTaken': 'عنوان البريد الإلكتروني هذا مستخدَم بالفعل.',
    'auth.loginFailed': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
    'auth.notLoggedIn': 'يجب عليك تسجيل الدخول.',
    'auth.wrongAccountType': 'الوصول مخصّص لنوع آخر من الحسابات.',
    'auth.accountNotFound': 'الحساب غير موجود.',
    'auth.currentPasswordWrong': 'كلمة المرور الحالية غير صحيحة.',
    'auth.dealerRequired': 'اسم المستخدم وكلمة المرور والاسم إلزامية.',
    'auth.adminAccountsNotManaged': 'لا يمكن إدارة حسابات المسؤولين من هذه الواجهة.',
    'auth.adminAccountsNotDeleted': 'لا يمكن حذف حسابات المسؤولين من هذه الواجهة.',
    'car.notFound': 'المركبة غير موجودة.',
    'car.otherDealer': 'تعود هذه المركبة إلى وكيل آخر.',
    'car.requiredFields': 'يرجى ملء جميع الحقول المطلوبة.',
    'car.defaultDealerName': 'وكيل',
    'request.notFound': 'الإعلان غير موجود.',
    'request.otherUser': 'يعود هذا الإعلان إلى مستخدم آخر.',
    'request.requiredFields': 'يرجى ملء جميع الحقول المطلوبة.',
    'request.defaultOwnerName': 'فرد',
    'upload.badType': 'يُقبل فقط تنسيق الصور (jpg, png, webp, gif).',
    'upload.tooLarge': 'حجم هذه الصورة يتجاوز الحد الأقصى المسموح به (6 ميغابايت).',
    'generic.rateLimited': 'عدد كبير جدًا من الطلبات، يرجى المحاولة لاحقًا.',
    'generic.authRateLimited': 'عدد كبير جدًا من المحاولات، يرجى المحاولة لاحقًا.',
    'generic.routeNotFound': 'المسار غير موجود.',
    'generic.serverError': 'خطأ داخلي في الخادم.'
  }
};

function translate(lang, key, vars) {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  let str = MESSAGES[l][key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    }
  }
  return str;
}

// Détecte la langue à utiliser pour cette requête : priorité à l'en-tête
// X-Lang (envoyé par le frontend avec la langue choisie par l'utilisateur
// sur le site — voir public/js/app.js), puis Accept-Language (langue du
// navigateur) en repli, puis le français par défaut.
function detectLangMiddleware(req, res, next) {
  let lang = (req.headers['x-lang'] || '').toString().slice(0, 2).toLowerCase();
  if (!SUPPORTED_LANGS.includes(lang)) {
    const accept = (req.headers['accept-language'] || '').slice(0, 2).toLowerCase();
    lang = SUPPORTED_LANGS.includes(accept) ? accept : DEFAULT_LANG;
  }
  req.lang = lang;
  next();
}

module.exports = { translate, detectLangMiddleware, SUPPORTED_LANGS, DEFAULT_LANG };
