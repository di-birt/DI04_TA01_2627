// *****************************************************************************
// InformeService — coordina la construcción del HTML, la petición HTTP y la
// descarga del PDF.
//
// El backend (carpeta /server) es quien ejecuta Puppeteer. Este servicio solo
// se encarga de:
//   1. Pedir a InformeHtmlService un documento HTML autocontenido.
//   2. Enviarlo por POST al backend y recibir el PDF como Blob.
//   3. Crear una descarga en el navegador.
// La ejecución de Chromium y la conversión final a PDF pertenecen al servidor,
// no a este servicio Angular.
// *****************************************************************************
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Restaurante } from '../interface/restaurante';
import { environment } from '../../environments/environment';
// FiltrosInforme solo es una interfaz y desaparece al transpilar a JavaScript.
// `type` indica que este import se usa únicamente para comprobación estática,
// evitando generar una importación JavaScript que no sería necesaria.
import { InformeHtmlService, type FiltrosInforme } from './informe-html.service';

export type { FiltrosInforme } from './informe-html.service';

@Injectable({ providedIn: 'root' })
export class InformeService {

  constructor(
    private http: HttpClient,
    private informeHtmlService: InformeHtmlService
  ) {}

  // Coordina una exportación completa. Recibe datos ya preparados por la
  // pantalla y por GraficosInformeService; no vuelve a filtrar restaurantes ni
  // dibuja gráficos aquí.
  //
  // responseType: 'blob' impide que HttpClient intente interpretar los bytes
  // binarios del PDF como JSON.
  async generarInformePDF(
    restaurantes: Restaurante[],
    imagenesGraficos: Record<string, string>,
    filtros: FiltrosInforme
  ): Promise<void> {
    // La plantilla se mantiene en otro servicio para que el código HTTP no
    // quede mezclado con el marcado y el CSS del informe.
    const html = this.informeHtmlService.construirHTML(restaurantes, imagenesGraficos, filtros);

    // El servidor recibe el HTML dentro de JSON, ejecuta Puppeteer y devuelve
    // una respuesta cuyo cuerpo son los bytes del PDF.
    const blob = await firstValueFrom(
      this.http.post(`${environment.informesApiUrl}/api/informe`, { html }, { responseType: 'blob' })
    );

    // El nombre incluye la fecha para que los informes descargados sean fáciles
    // de identificar y no se sobrescriban accidentalmente.
    this.descargarBlob(blob, `informe_restaurantes_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // Crea una URL temporal para iniciar la descarga del PDF recibido. Blob URL
  // permite que un enlace del navegador apunte al contenido binario sin subirlo
  // de nuevo a ningún sitio. La URL se revoca después del clic, cuando el
  // navegador ya ha leído el contenido.
  private descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    // El enlace debe estar en el DOM para que el navegador inicie la descarga.
    // Se elimina después del clic porque ya no es necesario mantenerlo visible.
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revocar demasiado pronto puede producir un archivo corrupto o no
    // admitido; se espera un instante para dar tiempo al navegador a leerlo.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
