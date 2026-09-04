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

@Injectable({ providedIn: 'root' })
export class InformeService {

  constructor(private http: HttpClient) {}

  async generarInformePDF(restaurantes: Restaurante[], imagenesGraficos: Record<string, string>): Promise<void> {
    const html = this.construirHTML(restaurantes, imagenesGraficos);

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
  private construirHTML(restaurantes: Restaurante[], imagenes: Record<string, string>): string {
    const filas = restaurantes.map(r => `
      <tr>
        <td>${r.documentName ?? ''}</td>
        <td>${r.territory ?? ''}</td>
        <td>${r.locality ?? ''}</td>
        <td>${r.restorationType ?? ''}</td>
      </tr>
    `).join('');

    const graficos = Object.values(imagenes)
      .map(src => `<img src="${src}" class="grafico" />`)
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #222; margin: 0; padding: 0; }
          h1 { font-size: 20px; border-bottom: 2px solid #3880ff; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
          th { background: #3880ff; color: #fff; }
          .graficos { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; page-break-before: always; }
          .grafico { width: 48%; border: 1px solid #eee; }
        </style>
      </head>
      <body>
        <h1>Informe de Restaurantes — Guía Euskadi</h1>
        <p>Generado el ${new Date().toLocaleString('es-ES')} · ${restaurantes.length} restaurantes</p>

        <table>
          <thead>
            <tr><th>Nombre</th><th>Territorio</th><th>Localidad</th><th>Tipo</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        <div class="graficos">${graficos}</div>
      </body>
      </html>
    `;
  }

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
