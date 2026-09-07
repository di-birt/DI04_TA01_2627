// *****************************************************************************
// InformeHtmlService — prepara el documento independiente que imprimirá
// Puppeteer. Se mantiene separado de InformeService para que la comunicación
// HTTP y la plantilla del informe tengan responsabilidades distintas.
//
// Este servicio no muestra el HTML en una pantalla Angular. Devuelve un string
// con un documento completo porque el backend recibirá ese string y lo cargará
// en una página de Chromium antes de convertirlo en PDF.
// *****************************************************************************
import { Injectable } from '@angular/core';
import { Restaurante } from '../interface/restaurante';

// Estos datos describen los filtros que se mostrarán en la cabecera del PDF.
// La interfaz solo existe durante la comprobación de TypeScript: al ejecutar
// la aplicación no se crea ningún objeto adicional por haberla declarado.
export interface FiltrosInforme {
  busqueda: string;
  territorios: string[];
  localidades: string[];
}

@Injectable({ providedIn: 'root' })
export class InformeHtmlService {
  // El HTML incluye sus propios estilos porque Puppeteer no puede reutilizar
  // directamente los estilos SCSS encapsulados de Angular/Ionic. El método es
  // público porque InformeService lo utiliza como paso de su flujo de exportación.
  construirHTML(
    restaurantes: Restaurante[],
    imagenes: Record<string, string>,
    filtros: FiltrosInforme
  ): string {
    // Cada restaurante se convierte en una fila de la tabla. El operador ?? ''
    // evita escribir "null" o "undefined" si un campo no tiene valor.
    const filas = restaurantes.map(r => `
      <tr>
        <td>${r.documentName ?? ''}</td>
        <td>${r.territory ?? ''}</td>
        <td>${r.locality ?? ''}</td>
        <td>${r.restorationType ?? ''}</td>
      </tr>
    `).join('');

    // Las claves coinciden con las imágenes generadas por Chart.js. Mantener
    // este contrato permite añadir gráficos sin pasar títulos por separado.
    const titulosGraficos: Record<string, string> = {
      territorios: 'Restaurantes por territorio',
      linea: 'Distinciones gastronómicas por territorio',
      tipos: 'Restaurantes por tipo de establecimiento',
      localidades: 'Top localidades con más restaurantes',
    };
    // Object.entries() recorre el mapa de imágenes y genera una figura por
    // cada gráfico, usando la cadena Base64 directamente como src.
    const graficos = Object.entries(imagenes)
      .map(([clave, src]) => `
        <figure class="grafico">
          <img src="${src}" alt="${titulosGraficos[clave] ?? 'Gráfica del informe'}" />
          <figcaption>${titulosGraficos[clave] ?? 'Gráfica del informe'}</figcaption>
        </figure>
      `)
      .join('');

    // Solo se muestran los filtros que tienen contenido; si no hay ninguno,
    // el PDF indica expresamente que contiene todos los restaurantes. El type
    // predicate del filter permite que TypeScript trate el resultado como
    // string[] y no como una mezcla de string y valores falsy.
    const filtrosAplicados = [
      filtros.busqueda && `Búsqueda: ${filtros.busqueda}`,
      filtros.territorios.length > 0 && `Territorios: ${filtros.territorios.join(', ')}`,
      filtros.localidades.length > 0 && `Localidades: ${filtros.localidades.join(', ')}`,
    ].filter((filtro): filtro is string => !!filtro);
    const resumenFiltros = filtrosAplicados.length > 0
      ? filtrosAplicados.map(filtro => `<span class="filtro">${filtro}</span>`).join('')
      : '<span class="sin-filtros">Sin filtros aplicados: se incluyen todos los restaurantes.</span>';

    // La plantilla es un template literal para poder insertar datos dinámicos
    // sin construir el documento mediante concatenaciones independientes.
    // El CSS se incluye aquí porque este HTML se renderizará fuera de Angular.
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
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
}