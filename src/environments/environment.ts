
export const environment = {
  production: false,
  // URL del backend Express+Puppeteer (carpeta /server). En emulador Android
  // usa http://10.0.2.2:3000 en vez de localhost.
  informesApiUrl: 'http://localhost:3000',
  auth: {
    email: 'mardanza@birt.eus',
    password: 'Test1234',
  },
  firebase : {
    apiKey: "AIzaSyBGXAMJMVhgfAUorRqBZLg9DXTjXF_3R5k",
    authDomain: "di-bbdd-472ce.firebaseapp.com",
    projectId: "di-bbdd-472ce",
    storageBucket: "di-bbdd-472ce.firebasestorage.app",
    messagingSenderId: "1053575576004",
    appId: "1:1053575576004:web:033199ff777d04aaf40c91"
  }
}