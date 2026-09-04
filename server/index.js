// *****************************************************************************
// SERVIDOR DE INFORMES — Express + Puppeteer
//
// Este servidor NO forma parte de la app Ionic. Es un proceso Node.js aparte
// porque Puppeteer necesita descargar y ejecutar un Chromium real, algo que
// no es posible ni en el navegador ni en un dispositivo móvil (Capacitor).
//
// Flujo:
//   1. El frontend construye el HTML del informe (con las gráficas ya
//      convertidas a imágenes base64) y lo envía por POST.
//   2. Puppeteer abre una página headless, le mete ese HTML tal cual y lo
//      imprime a PDF, respetando el CSS igual que lo haría Chrome.
//   3. Devolvemos el PDF como buffer binario.
//
// Arrancar: cd server && npm install && npm start   (escucha en :3000)
// *****************************************************************************
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();

// Los informes con varias gráficas en base64 pueden pesar varios MB.
app.use(express.json({ limit: '25mb' }));
app.use(cors());

// *****************************************************************************
// Reutilizamos UNA sola instancia de Chromium para todas las peticiones.
// Abrir un navegador entero (browser.launch) en cada petición es lento;
// lo que sí abrimos y cerramos por petición es la "page" (pestaña).
// *****************************************************************************
let browserPromise = puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

app.post('/api/informe', async (req, res) => {
  const { html } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Falta el campo "html" en el cuerpo de la petición.' });
  }

  let page;
  try {
    const browser = await browserPromise;
    page = await browser.newPage();

    // waitUntil 'networkidle0' asegura que las imágenes base64 y estilos
    // ya están aplicados antes de imprimir el PDF.
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    });

    res.set('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generando el PDF:', err);
    res.status(500).json({ error: 'No se pudo generar el informe.' });
  } finally {
    await page?.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de informes escuchando en http://localhost:${PORT}`);
});

// Cierra Chromium limpiamente si el proceso se detiene (Ctrl+C).
process.on('SIGINT', async () => {
  const browser = await browserPromise;
  await browser.close();
  process.exit(0);
});
