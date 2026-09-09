// *****************************************************************************
// SERVIDOR — Express (TypeScript)
//
// npm start ejecuta este archivo mediante tsx.
// *****************************************************************************
import cors from 'cors';
import express, { type Request, type Response } from 'express';

// Express recibe las peticiones HTTP y registra las rutas disponibles en esta
// aplicación. Todas las configuraciones que se añaden con `app.use` se aplican
// antes de que la petición llegue a las rutas.
const app = express();

// Convierte cuerpos JSON en objetos JavaScript accesibles mediante `req.body`.
app.use(express.json());

// Permite que la aplicación Ionic, ejecutándose normalmente en otro puerto
// durante el desarrollo, pueda llamar a este servidor. Sin CORS el navegador
// bloquearía esa petición por pertenecer a un origen distinto.
app.use(cors());

// *****************************************************************************
// RUTA DE PRUEBA — pensada para el primer contacto con este servidor.
//
// Solo recibe un JSON sencillo y responde con otro JSON. Sirve para comprobar
// que la app Angular y este servidor pueden comunicarse.
// *****************************************************************************
app.post('/api/eco', (req: Request<unknown, unknown, { mensaje?: string }>, res: Response) => {
  const { mensaje } = req.body;

  if (!mensaje) {
    return res.status(400).json({ error: 'Falta el campo "mensaje" en el cuerpo de la petición.' });
  }

  // Devuelve el mensaje recibido junto con la hora del servidor, para que se
  // note claramente que la respuesta viene del backend y no de Angular.
  res.json({
    mensaje: `El servidor ha recibido tu mensaje: "${mensaje}"`,
    recibidoEn: new Date().toISOString(),
  });
});

// Permite configurar el puerto mediante la variable de entorno `PORT`; cuando
// no existe, el servidor usa 3000 para que la aplicación sepa dónde conectarse.
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});