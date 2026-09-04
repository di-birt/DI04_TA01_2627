// *****************************************************************************
// SERVIDOR DE INFORMES — Express + Puppeteer (TypeScript)
//
// Esta es la versión TypeScript del servidor. index.js se conserva como
// referencia; npm start ejecuta este archivo mediante tsx.
// *****************************************************************************
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import puppeteer from 'puppeteer';

interface InformeRequestBody {
  html?: string;
}

const app = express();

// Los informes con varias gráficas en base64 pueden pesar varios MB.
app.use(express.json({ limit: '25mb' }));
app.use(cors());

// Reutilizamos una única instancia de Chromium: abrirla en cada petición es
// costoso, pero cada informe usa su propia página y se cierra al terminar.
const browserPromise = puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

app.post('/api/informe', async (req: Request<unknown, unknown, InformeRequestBody>, res: Response) => {
  const { html } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Falta el campo "html" en el cuerpo de la petición.' });
  }

  let page: Awaited<ReturnType<Awaited<typeof browserPromise>['newPage']>> | undefined;

  try {
    const browser = await browserPromise;
    page = await browser.newPage();

    // El HTML ya contiene las tablas, filtros y gráficas en base64 enviados
    // por Angular. load basta porque el documento no espera recursos externos.
    await page.setContent(html, { waitUntil: 'load' });

    // Los márgenes reservan espacio para las plantillas de impresión, que
    // Chromium coloca automáticamente en todas las páginas del documento.
    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: '28mm', bottom: '22mm', left: '12mm', right: '12mm' },
      // Estas plantillas no heredan el CSS del HTML principal; por eso sus
      // estilos son inline. pageNumber y totalPages los sustituye Chromium.
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
            <span style="float: right; color: #1e3a5f; font-weight: bold;">Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>
        </div>
      `,
    });

    // Buffer evita que Express convierta el Uint8Array de Puppeteer a JSON.
    res.type('application/pdf').send(Buffer.from(pdfData));
  } catch (error: unknown) {
    console.error('Error generando el PDF:', error);
    res.status(500).json({ error: 'No se pudo generar el informe.' });
  } finally {
    await page?.close();
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Servidor de informes escuchando en http://localhost:${port}`);
});

// Cierra Chromium limpiamente cuando se detiene el servidor con Ctrl+C.
process.on('SIGINT', async () => {
  const browser = await browserPromise;
  await browser.close();
  process.exit(0);
});