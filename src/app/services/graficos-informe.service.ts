// *****************************************************************************
// GraficosInformeService
//
// Este servicio existe únicamente para el PDF. A diferencia de
// GraficosComponent, no pinta nada en la interfaz: crea canvas temporales,
// los convierte en imágenes base64 y destruye los gráficos al terminar.
// Por eso funciona igual aunque el ion-segment activo sea "Tabla".
// *****************************************************************************
import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Restaurante } from '../interface/restaurante';

// Chart.js carga sus tipos de gráficos de forma modular. Este registro se hace
// una única vez al importar el servicio, antes de crear cualquier Chart.
Chart.register(...registerables);

@Injectable({ providedIn: 'root' })
export class GraficosInformeService {
  // Paleta compartida por las gráficas de barras y donut. El operador % hace
  // que los colores vuelvan a empezar si hay más categorías que colores.
  private readonly colors = ['#3880ff', '#2dd36f', '#eb445a', '#ffc409', '#5260ff', '#0cd1e8', '#f7a34b', '#a855f7', '#10dc60', '#92949c'];

  /**
   * Genera las imágenes solo durante la exportación. Los canvas no pertenecen
   * a ningún ion-segment, por lo que el PDF no depende de la vista activa.
   */
  obtenerImagenes(restaurantes: Restaurante[]): Record<string, string> {
    // Cada clave será también la clave usada por InformeService para asignar
    // el título correcto a la imagen dentro del HTML que imprimirá Puppeteer.
    const configuraciones: Record<string, ChartConfiguration> = {
      territorios: this.configuracionTerritorios(restaurantes),
      linea: this.configuracionDistinciones(restaurantes),
      tipos: this.configuracionTipos(restaurantes),
      localidades: this.configuracionLocalidades(restaurantes),
    };
    const imagenes: Record<string, string> = {};

    // No añadimos los canvas al DOM: para exportar un PNG basta asignarles un
    // tamaño fijo. responsive y animation se desactivan en las configuraciones
    // para que el resultado sea inmediato y reproducible.
    for (const [clave, configuracion] of Object.entries(configuraciones)) {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 500;
      const chart = new Chart(canvas, configuracion);

      try {
        // toBase64Image() transforma el canvas en data:image/png;base64,...
        // que puede viajar dentro del JSON y usarse directamente como src.
        imagenes[clave] = chart.toBase64Image();
      } finally {
        // Es obligatorio liberar la instancia para eliminar listeners y memoria
        // aunque una gráfica concreta fallase al exportarse.
        chart.destroy();
      }
    }

    return imagenes;
  }

  private configuracionTerritorios(data: Restaurante[]): ChartConfiguration<'bar'> {
    // contar() agrupa y ordena de mayor a menor; el resultado se convierte en
    // etiquetas (territorios) y valores (número de restaurantes).
    const valores = this.contar(data, restaurante => restaurante.territory?.trim() || 'Desconocido');
    return {
      type: 'bar',
      data: {
        labels: valores.map(([nombre]) => nombre),
        datasets: [{
          label: 'Restaurantes',
          data: valores.map(([, cantidad]) => cantidad),
          backgroundColor: valores.map((_, index) => `${this.colors[index % this.colors.length]}bb`),
          borderColor: valores.map((_, index) => this.colors[index % this.colors.length]),
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: this.opcionesConEjes('Restaurantes por territorio', 'y'),
    };
  }

  private configuracionDistinciones(data: Restaurante[]): ChartConfiguration<'line'> {
    // En esta gráfica hay dos valores por territorio, por lo que usamos un Map
    // cuyo valor es un objeto acumulador en vez del contador simple.
    const porTerritorio = new Map<string, { michelin: number; repsol: number }>();
    data.forEach(restaurante => {
      const territorio = restaurante.territory?.trim() || 'Desconocido';
      const valores = porTerritorio.get(territorio) ?? { michelin: 0, repsol: 0 };
      valores.michelin += Number(restaurante.michelinStar) || 0;
      valores.repsol += Number(restaurante.repsolSun) || 0;
      porTerritorio.set(territorio, valores);
    });
    // Se omiten territorios sin estrellas ni soles para evitar series vacías.
    const valores = [...porTerritorio.entries()]
      .filter(([, cantidad]) => cantidad.michelin > 0 || cantidad.repsol > 0)
      .sort(([territorioA], [territorioB]) => territorioA.localeCompare(territorioB));

    return {
      type: 'line',
      data: {
        labels: valores.map(([nombre]) => nombre),
        datasets: [
          { label: 'Estrellas Michelin', data: valores.map(([, cantidad]) => cantidad.michelin), borderColor: '#eb445a', backgroundColor: '#eb445a22', fill: true, tension: 0.4, pointRadius: 5 },
          { label: 'Soles Repsol', data: valores.map(([, cantidad]) => cantidad.repsol), borderColor: '#ffc409', backgroundColor: '#ffc40922', fill: true, tension: 0.4, pointRadius: 5 },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: true, position: 'top' }, title: { display: true, text: 'Distinciones gastronómicas por territorio', font: { size: 18, weight: 'bold' }, color: '#333' } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#555' } }, x: { ticks: { color: '#555' }, grid: { display: false } } },
      },
    };
  }

  private configuracionTipos(data: Restaurante[]): ChartConfiguration<'bar'> {
    // La misma función de conteo se reutiliza con otra propiedad del restaurante.
    const valores = this.contar(data, restaurante => restaurante.restorationType?.trim() || 'Desconocido');
    return {
      type: 'bar',
      data: {
        labels: valores.map(([nombre]) => nombre),
        datasets: [{ label: 'Restaurantes', data: valores.map(([, cantidad]) => cantidad), backgroundColor: valores.map((_, index) => `${this.colors[index % this.colors.length]}bb`), borderColor: valores.map((_, index) => this.colors[index % this.colors.length]), borderWidth: 2, borderRadius: 6 }],
      },
      options: this.opcionesConEjes('Restaurantes por tipo de establecimiento', 'x', 'y'),
    };
  }

  private configuracionLocalidades(data: Restaurante[]): ChartConfiguration<'doughnut'> {
    // slice(0, 10) conserva solo las diez localidades con más restaurantes.
    const valores = this.contar(data, restaurante => restaurante.locality?.trim() || 'Desconocida').slice(0, 10);
    return {
      type: 'doughnut',
      data: {
        labels: valores.map(([nombre]) => nombre),
        datasets: [{ data: valores.map(([, cantidad]) => cantidad), backgroundColor: valores.map((_, index) => `${this.colors[index % this.colors.length]}bb`), borderColor: valores.map((_, index) => this.colors[index % this.colors.length]), borderWidth: 2, hoverOffset: 10 }],
      },
      options: { responsive: false, animation: false, plugins: { legend: { position: 'right', labels: { padding: 12, usePointStyle: true, font: { size: 13 }, color: '#333' } }, title: { display: true, text: 'Top 10 localidades con más restaurantes', font: { size: 18, weight: 'bold' }, color: '#333' } } },
    };
  }

  private contar(data: Restaurante[], obtenerClave: (restaurante: Restaurante) => string): [string, number][] {
    // obtenerClave permite reutilizar el algoritmo: cambia la propiedad a
    // agrupar (territorio, tipo o localidad), no el código de conteo.
    const conteos = new Map<string, number>();
    data.forEach(restaurante => {
      const clave = obtenerClave(restaurante);
      conteos.set(clave, (conteos.get(clave) ?? 0) + 1);
    });
    return [...conteos.entries()].sort(([, cantidadA], [, cantidadB]) => cantidadB - cantidadA);
  }

  private opcionesConEjes(titulo: string, ejeValores: 'x' | 'y', ejeCategorias: 'x' | 'y' = 'x') {
    // Las barras verticales usan y como eje de valores. Las horizontales usan
    // x; al cambiar indexAxis a y, Chart.js intercambia la orientación.
    return {
      responsive: false as const,
      animation: false as const,
      indexAxis: ejeValores === 'x' ? 'y' as const : 'x' as const,
      plugins: { legend: { display: false }, title: { display: true, text: titulo, font: { size: 18, weight: 'bold' as const }, color: '#333' } },
      scales: {
        [ejeValores]: { beginAtZero: true, ticks: { stepSize: 1, color: '#555' }, grid: { color: 'rgba(0,0,0,0.06)' } },
        [ejeCategorias]: { ticks: { color: '#555' }, grid: { display: false } },
      },
    };
  }
}