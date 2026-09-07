// *****************************************************************************
// GraficosInformeService
//
// Este servicio prepara las imágenes que se insertarán en el PDF. Es distinto
// de GraficosComponent porque no depende de una vista visible de Ionic ni de
// un ion-segment concreto: crea gráficos temporales, los convierte a imágenes
// Base64 y libera sus recursos al terminar.
//
// El flujo es el siguiente:
//   1. Recibe los restaurantes que ya ha filtrado HomePage.
//   2. Construye una configuración de Chart.js para cada gráfico.
//   3. Dibuja cada gráfico en un canvas temporal.
//   4. Convierte el canvas en una imagen data:image/png;base64,...
//   5. Devuelve un objeto de imágenes y destruye cada instancia de Chart.
// *****************************************************************************
import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Restaurante } from '../interface/restaurante';

// Chart.js carga los tipos de gráficos y sus elementos de forma modular. Este
// registro debe ejecutarse antes de crear cualquier instancia de Chart; hacerlo
// aquí permite que todas las configuraciones del servicio tengan disponibles
// barras, líneas, leyendas, títulos y gráficos de tipo donut.
Chart.register(...registerables);

@Injectable({ providedIn: 'root' })
export class GraficosInformeService {
  // Paleta compartida por las gráficas de barras y donut. El operador módulo
  // (%) permite reutilizar los colores cuando hay más categorías que colores
  // definidos, evitando que una categoría se quede sin color.
  private readonly colors = ['#3880ff', '#2dd36f', '#eb445a', '#ffc409', '#5260ff', '#0cd1e8', '#f7a34b', '#a855f7', '#10dc60', '#92949c'];

  /**
   * Genera las imágenes solo durante la exportación.
   *
   * El tipo Record<string, string> significa que el resultado es un objeto
   * cuyas claves identifican cada gráfico y cuyos valores son sus imágenes
   * Base64. Por ejemplo: { territorios: 'data:image/png;base64,...' }.
   * Los nombres de las claves deben coincidir con los que espera
   * InformeHtmlService al elegir los títulos del PDF.
   */
  obtenerImagenes(restaurantes: Restaurante[]): Record<string, string> {
    // Cada clave identifica una gráfica y también se utiliza en
    // InformeHtmlService para asignar el título correcto a la imagen dentro
    // del HTML que imprimirá Puppeteer.
    const configuraciones: Record<string, ChartConfiguration> = {
      territorios: this.configuracionTerritorios(restaurantes),
      linea: this.configuracionDistinciones(restaurantes),
      tipos: this.configuracionTipos(restaurantes),
      localidades: this.configuracionLocalidades(restaurantes),
    };
    const imagenes: Record<string, string> = {};

    // No añadimos los canvas al DOM porque solo necesitamos su contenido
    // rasterizado. Les damos un tamaño fijo para que todas las imágenes tengan
    // una resolución previsible en el PDF. Las opciones responsive y animation
    // están desactivadas para que la captura sea inmediata y reproducible.
    for (const [clave, configuracion] of Object.entries(configuraciones)) {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 500;
      // Chart.js puede trabajar directamente con el elemento canvas creado por
      // el navegador. No es necesario mostrarlo en pantalla al usuario.
      const chart = new Chart(canvas, configuracion);

      try {
        // toBase64Image() transforma el canvas en una URL de datos PNG. Esa
        // cadena puede viajar dentro del JSON y utilizarse directamente como
        // atributo src de una etiqueta <img> en el HTML del informe.
        imagenes[clave] = chart.toBase64Image();
      } finally {
        // Es obligatorio liberar la instancia para eliminar listeners y memoria
        // aunque una gráfica concreta falle al exportarse. El bloque finally
        // garantiza la limpieza tanto en caso de éxito como de excepción.
        chart.destroy();
      }
    }

    return imagenes;
  }

  private configuracionTerritorios(data: Restaurante[]): ChartConfiguration<'bar'> {
    // contar() agrupa y ordena de mayor a menor. Después, cada tupla se separa
    // en etiquetas (territorios) y valores (número de restaurantes), que es la
    // estructura que Chart.js necesita para un gráfico de barras.
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
    // En esta gráfica hay dos valores por territorio. Por eso usamos un Map
    // cuyo valor es un objeto acumulador, en lugar del contador simple de las
    // gráficas anteriores.
    const porTerritorio = new Map<string, { michelin: number; repsol: number }>();
    data.forEach(restaurante => {
      const territorio = restaurante.territory?.trim() || 'Desconocido';
      const valores = porTerritorio.get(territorio) ?? { michelin: 0, repsol: 0 };
      // Los datos pueden llegar como texto desde el JSON. Number() los
      // convierte para poder sumarlos y || 0 evita introducir NaN.
      valores.michelin += Number(restaurante.michelinStar) || 0;
      valores.repsol += Number(restaurante.repsolSun) || 0;
      porTerritorio.set(territorio, valores);
    });
    // Se omiten territorios sin estrellas ni soles para evitar series vacías y
    // conseguir que el gráfico solo muestre categorías con información útil.
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
    // Se reutiliza la misma función de conteo, cambiando únicamente la
    // propiedad del restaurante que se utiliza como categoría.
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
    // contar() ya devuelve las localidades ordenadas de mayor a menor; por eso
    // slice(0, 10) conserva las diez primeras y evita un donut ilegible.
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
    // agrupar (territorio, tipo o localidad), pero no el código de conteo.
    // El resultado es una lista de pares [nombre, cantidad], ordenada de mayor
    // a menor para que Chart.js muestre primero los valores más importantes.
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