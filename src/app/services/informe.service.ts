// *****************************************************************************
// InformeService — construye el HTML del informe y pide el PDF al backend
//
// El backend (carpeta /server) es quien ejecuta Puppeteer. Este servicio solo
// se encarga de:
//   1. Montar un documento HTML autocontenido (estilos inline, imágenes en
//      base64) con la tabla de datos y las gráficas.
//   2. Enviarlo por POST y recibir el PDF como blob.
//   3. Descargarlo en el navegador (o abrirlo, en el caso de Capacitor).
// *****************************************************************************
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Restaurante } from '../interface/restaurante';
import { environment } from '../../environments/environment';

// Describe el contexto de la lista filtrada para dejar constancia en el PDF
// de los criterios que se aplicaron al generar cada informe.
export interface FiltrosInforme {
  busqueda: string;
  territorios: string[];
  localidades: string[];
}

@Injectable({ providedIn: 'root' })
export class InformeService {

  constructor(private http: HttpClient) {}

  // Envía al backend un documento HTML autocontenido. responseType: 'blob'
  // impide que HttpClient intente interpretar el binario PDF como JSON.
  async generarInformePDF(
    restaurantes: Restaurante[],
    imagenesGraficos: Record<string, string>,
    filtros: FiltrosInforme
  ): Promise<void> {
    const html = this.construirHTML(restaurantes, imagenesGraficos, filtros);

    const blob = await firstValueFrom(
      this.http.post(`${environment.informesApiUrl}/api/informe`, { html }, { responseType: 'blob' })
    );

    this.descargarBlob(blob, `informe_restaurantes_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ***************************************************************************
  // construirHTML — documento imprimible completo
  //
  // Puppeteer no comparte estilos con la app Angular, así que este HTML lleva
  // su propio <style>. Las gráficas se insertan como <img src="data:image/..">
  // porque son las que ya generó Chart.js con toBase64Image().
  // ***************************************************************************
  private construirHTML(
    restaurantes: Restaurante[],
    imagenes: Record<string, string>,
    filtros: FiltrosInforme
  ): string {
    const filas = restaurantes.map(r => `
      <tr>
        <td>${r.documentName ?? ''}</td>
        <td>${r.territory ?? ''}</td>
        <td>${r.locality ?? ''}</td>
        <td>${r.restorationType ?? ''}</td>
      </tr>
    `).join('');

    // Las claves proceden del Map de Chart.js; este mapa ofrece a cada imagen
    // una leyenda legible en el PDF sin depender de la pantalla actual.
    const titulosGraficos: Record<string, string> = {
      territorios: 'Restaurantes por territorio',
      linea: 'Distinciones gastronómicas por territorio',
      tipos: 'Restaurantes por tipo de establecimiento',
      localidades: 'Top localidades con más restaurantes',
    };
    const graficos = Object.entries(imagenes)
      .map(([clave, src]) => `
        <figure class="grafico">
          <img src="${src}" alt="${titulosGraficos[clave] ?? 'Gráfica del informe'}" />
          <figcaption>${titulosGraficos[clave] ?? 'Gráfica del informe'}</figcaption>
        </figure>
      `)
      .join('');

    // Solo se incluyen criterios con valor. Así un informe sin filtros explica
    // expresamente que contiene el conjunto completo de restaurantes.
    const filtrosAplicados = [
      filtros.busqueda && `Búsqueda: ${filtros.busqueda}`,
      filtros.territorios.length > 0 && `Territorios: ${filtros.territorios.join(', ')}`,
      filtros.localidades.length > 0 && `Localidades: ${filtros.localidades.join(', ')}`,
    ].filter((filtro): filtro is string => !!filtro);
    const resumenFiltros = filtrosAplicados.length > 0
      ? filtrosAplicados.map(filtro => `<span class="filtro">${filtro}</span>`).join('')
      : '<span class="sin-filtros">Sin filtros aplicados: se incluyen todos los restaurantes.</span>';

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
           /* Este CSS viaja dentro del HTML porque Puppeteer no puede reutilizar
             los estilos de Angular/Ionic que se ejecutan en el navegador. */
           @page { size: A4; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 11px; }
          h1 { color: #0f172a; font-size: 25px; letter-spacing: 0; margin: 0 0 6px; }
          h2 { color: #0f172a; font-size: 16px; margin: 0; }
          .portada { border-left: 5px solid #2563eb; padding: 4px 0 4px 14px; }
          .metadatos { color: #64748b; margin: 0; font-size: 10px; }
          .filtros { background: #f1f5f9; border: 1px solid #dbe3ee; border-radius: 6px; margin-top: 16px; padding: 10px 12px; }
          .filtros-titulo { color: #1e3a5f; font-size: 9px; font-weight: bold; letter-spacing: 0.4px; margin-bottom: 6px; text-transform: uppercase; }
          .filtro { background: #dbeafe; border-radius: 10px; color: #1d4ed8; display: inline-block; font-size: 9px; margin: 2px 5px 2px 0; padding: 4px 7px; }
          .sin-filtros { color: #475569; font-size: 10px; }
          .seccion { margin-top: 24px; }
          .seccion-cabecera { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
          .seccion-cabecera::before { content: ''; display: block; width: 4px; height: 18px; background: #22c55e; border-radius: 2px; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10px; border: 1px solid #dbe3ee; border-radius: 6px; overflow: hidden; }
          thead { display: table-header-group; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 9px; text-align: left; vertical-align: top; }
          th { background: #1e3a5f; color: #ffffff; font-size: 9px; letter-spacing: 0.3px; text-transform: uppercase; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          tbody tr:last-child td { border-bottom: 0; }
          tr { break-inside: avoid; }
           /* La tabla puede ocupar varias páginas; el resumen visual comienza
             siempre en una página nueva para no mezclar ambos contenidos. */
           .graficos-seccion { break-before: page; }
          .graficos-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          .grafico { margin: 0; border: 1px solid #dbe3ee; border-radius: 6px; padding: 8px; background: #ffffff; break-inside: avoid; }
          .grafico img { display: block; width: 100%; height: 190px; object-fit: contain; }
          figcaption { border-top: 1px solid #e2e8f0; color: #475569; font-size: 9px; font-weight: bold; margin-top: 6px; padding-top: 6px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="portada">
          <h1>Informe de Restaurantes</h1>
          <p class="metadatos">Guía Euskadi · Generado el ${new Date().toLocaleString('es-ES')} · ${restaurantes.length} restaurantes</p>
        </div>

        <div class="filtros">
          <div class="filtros-titulo">Filtros aplicados</div>
          ${resumenFiltros}
        </div>

        <section class="seccion">
          <div class="seccion-cabecera"><h2>Restaurantes seleccionados</h2></div>
          <table>
            <thead>
              <tr><th>Nombre</th><th>Territorio</th><th>Localidad</th><th>Tipo</th></tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </section>

        <section class="seccion graficos-seccion">
          <div class="seccion-cabecera"><h2>Resumen gráfico</h2></div>
          <div class="graficos-grid">${graficos}</div>
        </section>
      </body>
      </html>
    `;
  }

  // Crea una URL temporal para iniciar la descarga del PDF recibido. La URL se
  // revoca después del clic, cuando el navegador ya ha leído el contenido.
  private descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    // El enlace debe estar en el DOM y la URL solo se libera después de que
    // el navegador haya iniciado la descarga; revocarla antes corrompe el
    // archivo guardado (causa típica de "PDF dañado o no admitido").
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
