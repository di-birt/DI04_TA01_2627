


/** NO SE UTILIZA YA QUE HACEMOS USO DE TYPESCRIPT, CON JS SIMPLIFICARÍA LA EJECUCIÓN, PERO COMPLICARÍA EL APRENDIZAJE. **/











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

    // page.pdf() imprime el HTML cargado con setContent. Los márgenes superior
    // e inferior reservan espacio para las plantillas que Chromium dibuja en
    // todas las páginas, fuera del contenido principal del informe.
    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: '28mm', bottom: '22mm', left: '12mm', right: '12mm' },
      // headerTemplate y footerTemplate no heredan el CSS del HTML recibido:
      // por eso cada uno incluye sus estilos en línea.
      headerTemplate: `
        <div style="box-sizing: border-box; width: 100%; padding: 0 12mm; font-family: Arial, sans-serif; color: #1e293b;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 5px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 20px; height: 20px; border-radius: 4px; background: #2563eb; color: #ffffff; font-size: 13px; font-weight: bold; line-height: 20px; text-align: center;">G</span>
              <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">GUIA DE RESTAURANTES EUSKADI</span>
            </div>
            <span style="font-size: 8px; color: #64748b;">INFORME DE RESULTADOS</span>
          </div>
        </div>
      `,
      footerTemplate: `
        <div style="box-sizing: border-box; width: 100%; padding: 0 12mm; font-family: Arial, sans-serif; font-size: 8px; color: #64748b;">
          <div style="border-top: 1px solid #cbd5e1; padding-top: 5px;">
            <span>Guia de Restaurantes Euskadi · Documento generado automaticamente</span>
            <!-- pageNumber y totalPages son valores que Chromium sustituye al imprimir. -->
            <span style="float: right; color: #1e3a5f; font-weight: bold;">Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>
        </div>
      `,
    });

    // Puppeteer devuelve un Uint8Array. Convertirlo a Buffer evita que Express
    // lo serialice como JSON y garantiza una descarga PDF válida.
    res.set('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfData));
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
