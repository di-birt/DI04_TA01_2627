// *****************************************************************************
// IMPORTS
// *****************************************************************************
import { Component, input, effect, viewChild, ElementRef, OnDestroy } from '@angular/core';

// *****************************************************************************
// IMPORTS — Ionic y Chart.js
//
// Chart.js es una librería JavaScript que dibuja gráficas interactivas sobre
// elementos HTML <canvas>. Se instala con: npm install chart.js
//
// Importamos:
//  · Chart → la clase principal; cada instancia representa una gráfica
//  · registerables → array con TODOS los tipos de gráfica y componentes
//    predefinidos (barras, donuts, escalas, tooltips, leyendas, etc.)
// *****************************************************************************
import { IonicModule } from '@ionic/angular';
import { Chart, registerables } from 'chart.js';
import { Restaurante } from '../../interface/restaurante';

// *****************************************************************************
// REGISTRO GLOBAL DE CHART.JS
//
// Chart.js usa un sistema de plugins modulares: si no registras un componente,
// no está disponible. Con ...registerables registramos de una vez todo lo que
// viene incluido en la librería (tipos bar, doughnut, line; escalas lineales,
// categóricas; plugin de tooltip, leyenda, título, etc.).
//
// Esto se hace UNA SOLA VEZ fuera de la clase para que no se repita en cada
// instancia del componente.
// *****************************************************************************
Chart.register(...registerables);

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './graficos.component.html',
  styleUrls: ['./graficos.component.scss']
})
export class GraficosComponent implements OnDestroy {

  // *************************************************************************
  // INPUT CON SEÑAL (Angular 17+)
  //
  // input<T>() es la forma moderna de recibir datos del componente padre.
  // Equivale a @Input() pero devuelve un Signal, lo que permite leerlo con
  // restaurantes() y reaccionar automáticamente a sus cambios mediante effect().
  //
  // El componente padre (home.page.html) lo usa así:
  //   <app-graficos [restaurantes]="restaurantesFiltrados()">
  // Pasámos restaurantesFiltrados() (un signal de tipo Restaurante[]) como parámetro y el componente hijo lo recibe como restaurantes() (otro InputSignal<Restaurante[]>).
  // *************************************************************************
  restaurantes = input<Restaurante[]>([]);

  // *************************************************************************
  // REFERENCIAS al DOM con viewChild (Angular 17+)
  //
  // viewChild<T>('nombre') es la forma moderna de @ViewChild.
  // Devuelve un Signal<ElementRef | undefined> que apunta al elemento del
  // template marcado con la variable de referencia #nombre.
  //
  // · Es undefined HASTA que Angular termina de construir la vista (similar
  //   a ngAfterViewInit con @ViewChild).
  // · Una vez el DOM está listo, el signal se actualiza automáticamente
  //   y su cambio dispara el effect() del constructor.
  //
  // ElementRef<HTMLCanvasElement> nos da acceso al elemento <canvas> nativo
  // del navegador, que es lo que Chart.js necesita para dibujar.
  // *************************************************************************
  private canvasTerritorios = viewChild<ElementRef<HTMLCanvasElement>>('canvasTerritorios');
  private canvasLinea       = viewChild<ElementRef<HTMLCanvasElement>>('canvasLinea');
  private canvasTipos       = viewChild<ElementRef<HTMLCanvasElement>>('canvasTipos');
  private canvasLocalidades = viewChild<ElementRef<HTMLCanvasElement>>('canvasLocalidades');

  // *************************************************************************
  // MAPA DE INSTANCIAS DE GRÁFICA
  //
  // Cada llamada a new Chart(canvas, config) crea un objeto Chart que ocupa
  // el canvas y registra sus propios event listeners (hover, click, resize).
  //
  // Si intentamos crear una segunda gráfica sobre el mismo canvas sin destruir
  // la primera, Chart.js lanza el error: "Canvas is already in use".
  //
  // Guardamos las instancias en un Map<clave, Chart> para poder localizarlas
  // por nombre y destruirlas antes de redibujar.
  // *************************************************************************
  private charts = new Map<string, Chart>();

  // *************************************************************************
  // CONSTRUCTOR — Reactividad con effect()
  //
  // effect() registra una función que Angular vuelve a ejecutar
  // automáticamente cada vez que cambia cualquier signal que se lea dentro
  // de ella. Aquí leemos cuatro signals:
  //   · this.restaurantes()          → datos que llegan del padre
  //   · this.canvasTerritorios()     → referencia al <canvas> del gráfico 1
  //   · this.canvasMichelin()        → referencia al <canvas> del gráfico 2
  //   · this.canvasLocalidades()     → referencia al <canvas> del gráfico 3
  //
  // FLUJO DE EJECUCIÓN:
  //  1. Angular crea el componente → el effect se ejecuta por primera vez.
  //     Los tres viewChild() son todavía undefined (el DOM aún no existe).
  //     → El guard "if (!cT || !cM || !cL) return" detiene la ejecución.
  //
  //  2. Angular termina de construir la vista → los viewChild() se actualizan.
  //     El effect se vuelve a ejecutar. Ahora los canvas YA existen.
  //     → Se dibujan las tres gráficas con los datos actuales.
  //
  //  3. El usuario cambia un filtro 
  //     → restaurantesFiltrados() en el padre cambia
  //     → el signal input restaurantes() cambia 
  //     → el effect se ejecuta.
  //     → Las gráficas se redesdibujan con los nuevos datos automáticamente.
  // *************************************************************************
  constructor() {
    effect(() => {
      const data = this.restaurantes();
      const cT   = this.canvasTerritorios();
      const cL   = this.canvasLinea();
      const cTi  = this.canvasTipos();
      const cD   = this.canvasLocalidades();

      if (!cT || !cL || !cTi || !cD) return;

      this.renderTerritorios(data, cT.nativeElement);
      this.renderLinea(data, cL.nativeElement);
      this.renderTipoRestaurante(data, cTi.nativeElement);
      this.renderLocalidades(data, cD.nativeElement);
    });
  }

  // *************************************************************************
  // destroyChart — limpieza obligatoria antes de redibujar
  //
  // chart.destroy() libera el canvas, elimina los event listeners internos
  // y marca la instancia como destruida. Sin esto, al redibujar aparecería
  // el error "Canvas is already in use" de Chart.js.
  // *************************************************************************
  private destroyChart(key: string) {
    this.charts.get(key)?.destroy();
    this.charts.delete(key);
  }

  // *************************************************************************
  // obtenerImagenes — exporta las gráficas actuales como PNG en base64
  //
  // chart.toBase64Image() lee directamente el <canvas> ya dibujado y lo
  // convierte a un data URL. Esto es lo que se inyecta como <img> en el HTML
  // que se envía al backend, porque Puppeteer no ejecuta Chart.js: solo
  // renderiza el HTML/CSS/imágenes que le pasamos.
  // *************************************************************************
  obtenerImagenes(): Record<string, string> {
    const imagenes: Record<string, string> = {};
    this.charts.forEach((chart, key) => {
      imagenes[key] = chart.toBase64Image();
    });
    return imagenes;
  }

  // *************************************************************************
  // GRÁFICO 1 — Barras verticales: restaurantes por territorio
  //
  // TIPO: 'bar' (barras verticales por defecto)
  //
  // PREPARACIÓN DE DATOS:
  //   Usamos un Map<territorio, conteo> para agrupar y contar en una sola
  //   pasada por el array. Después convertimos el Map en un array de pares
  //   [territorio, cantidad] y lo ordenamos de mayor a menor.
  //
  // COLORES:
  //   COLORS[i % COLORS.length] asigna un color por índice ciclando el array cuando hay más barras que colores definidos.
  //   El sufijo 'bb' en hex es el canal alpha (bb hex = ~73% opacidad),
  //   lo que da el efecto de relleno semitransparente con borde sólido.
  // *************************************************************************
  private renderTerritorios(data: Restaurante[], canvas: HTMLCanvasElement) {
    this.destroyChart('territorios');

    const counts = new Map<string, number>();
    data.forEach(r => {
      const t = r.territory?.trim() || 'Desconocido';
      counts.set(t, (counts.get(t) ?? 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const COLORS  = ['#3880ff', '#2dd36f', '#eb445a', '#ffc409', '#5260ff', '#92949c'];

    this.charts.set('territorios', new Chart(canvas, {
      type: 'bar',
      data: {
        // labels: etiquetas del eje X (nombres de los territorios)
        labels: sorted.map(([k]) => k),
        datasets: [{
          label: 'Restaurantes',
          // data: array de valores numéricos, uno por cada label
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length] + 'bb'),
          borderColor:     sorted.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 2,
          // borderRadius: redondea las esquinas superiores de cada barra
          borderRadius: 8,
          // borderSkipped: false → redondea TODAS las esquinas, no solo la superior
          borderSkipped: false,
        }]
      },
      options: {
        // responsive: true → la gráfica se redimensiona al cambiar el contenedor
        responsive: true,
        // maintainAspectRatio: false → permite controlar la altura desde CSS
        // (si fuera true, Chart.js impondría proporción 2:1 ancho/alto)
        maintainAspectRatio: false,
        plugins: {
          // Ocultamos la leyenda porque el título y el eje X ya identifican los datos
          legend: { display: false },
          title: {
            display: true,
            text: 'Restaurantes por territorio',
            font: { size: 15, weight: 'bold' },
            color: '#333',
            padding: { bottom: 14 }
          },
          tooltip: {
            callbacks: {
              // Sobreescribimos el texto del tooltip para personalizar el mensaje
              label: ctx => ` ${ctx.parsed.y} restaurantes`
            }
          }
        },
        scales: {
          y: {
            // beginAtZero: true → el eje Y empieza en 0, evita gráficas engañosas
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#555' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            ticks: { color: '#555' },
            // Ocultamos las líneas verticales de la cuadrícula en el eje X
            grid: { display: false }
          }
        }
      }
    }));
  }

  // *************************************************************************
  // GRÁFICO 2 — Línea: distinciones gastronómicas por territorio
  //
  // TIPO: 'line' (líneas que unen los puntos de datos de cada serie)
  //
  // PREPARACIÓN DE DATOS:
  //   Recorremos el array y acumulamos en un Map<territorio, {michelin, repsol}>
  //   el total de estrellas Michelin y soles Repsol de cada territorio.
  //   Después filtramos los territorios sin ninguna distinción para no
  //   mostrar entradas vacías, y ordenamos alfabéticamente para que las
  //   etiquetas del eje X sean consistentes entre filtrados.
  //
  // DOS DATASETS (dos líneas):
  //   Chart.js acepta múltiples datasets en el mismo canvas; cada uno
  //   dibuja su propia línea con su color y aparece en la leyenda.
  //   · dataset[0] → estrellas Michelin  (rojo #eb445a)
  //   · dataset[1] → soles Repsol        (amarillo #ffc409)
  //
  // fill: true → rellena el área bajo la línea con el mismo color al 13%
  //   de opacidad (sufijo '22' en hex), dando profundidad visual sin tapar
  //   la segunda línea.
  //
  // tension: 0.4 → suaviza la línea con curvas Bézier cúbicas.
  //   0 = línea recta entre puntos; 1 = curva muy pronunciada.
  //
  // pointRadius / pointHoverRadius: tamaño del círculo en cada punto de dato.
  //   Al pasar el ratón el radio aumenta para mejorar la interactividad.
  //
  // LEYENDA (display: true):
  //   Con dos series es imprescindible mostrar la leyenda para distinguirlas.
  //   usePointStyle: true dibuja el marcador con la misma forma que los puntos
  //   de la línea en lugar de un rectángulo.
  // *************************************************************************
  private renderLinea(data: Restaurante[], canvas: HTMLCanvasElement) {
    this.destroyChart('linea');

    const mapa = new Map<string, { michelin: number; repsol: number }>();
    data.forEach(r => {
      const t = r.territory?.trim() || 'Desconocido';
      const e = mapa.get(t) ?? { michelin: 0, repsol: 0 };
      e.michelin += Number(r.michelinStar) || 0;
      e.repsol   += Number(r.repsolSun)   || 0;
      mapa.set(t, e);
    });

    // Solo territorios con al menos una distinción
    const entries = [...mapa.entries()]
      .filter(([, v]) => v.michelin > 0 || v.repsol > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const labels   = entries.map(([k]) => k);
    const michelin = entries.map(([, v]) => v.michelin);
    const repsol   = entries.map(([, v]) => v.repsol);

    this.charts.set('linea', new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '⭐ Estrellas Michelin',
            data: michelin,
            borderColor: '#eb445a',
            backgroundColor: '#eb445a22',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
          {
            label: '☀️ Soles Repsol',
            data: repsol,
            borderColor: '#ffc409',
            backgroundColor: '#ffc40922',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#333', usePointStyle: true } },
          title: {
            display: true,
            text: 'Distinciones gastronómicas por territorio',
            font: { size: 15, weight: 'bold' },
            color: '#333',
            padding: { bottom: 14 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#555' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            ticks: { color: '#555' },
            grid: { display: false }
          }
        }
      }
    }));
  }

  // *************************************************************************
  // GRÁFICO 3 — Barras horizontales: restaurantes por tipo de establecimiento
  //
  // TIPO: 'bar' con indexAxis: 'y'
  //   Por defecto las barras son verticales (indexAxis: 'x').
  //   Cambiando a indexAxis: 'y' los ejes se intercambian:
  //     · Eje Y → categorías (tipos de establecimiento), sin escala numérica.
  //     · Eje X → valores numéricos (cantidad de restaurantes).
  //   Las barras horizontales son más legibles cuando las etiquetas
  //   de categoría son largas y no caben en el eje X sin rotarlas.
  //
  // PREPARACIÓN DE DATOS:
  //   Igual que en el gráfico de territorios: Map<tipo, conteo> + ordenación
  //   de mayor a menor para que la barra más larga quede arriba.
  //
  // COLORES:
  //   COLORS amplía la paleta a 10 entradas para cubrir más tipos sin repetir.
  //   El sufijo 'bb' (alpha ~73%) da relleno semitransparente con borde sólido.
  //
  // ESCALAS CON EJES INVERTIDOS respecto a las barras verticales:
  //   · scales.x → ahora es el eje de valores (beginAtZero: true, stepSize: 1)
  //   · scales.y → ahora es el eje de categorías (sin cuadrícula)
  //   En barras verticales era al revés (x = categorías, y = valores).
  //
  // borderRadius: 6 → redondea el extremo derecho de cada barra.
  //   En modo horizontal, borderSkipped no es necesario porque el redondeo
  //   solo afecta al extremo libre (el opuesto a la base).
  // *************************************************************************
  private renderTipoRestaurante(data: Restaurante[], canvas: HTMLCanvasElement) {
    this.destroyChart('tipos');

    const counts = new Map<string, number>();
    data.forEach(r => {
      const tipo = r.restorationType?.trim() || 'Desconocido';
      counts.set(tipo, (counts.get(tipo) ?? 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const COLORS = ['#3880ff', '#2dd36f', '#eb445a', '#ffc409', '#5260ff', '#0cd1e8', '#f7a34b', '#a855f7', '#10dc60', '#92949c'];

    this.charts.set('tipos', new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted.map(([k]) => k),
        datasets: [{
          label: 'Restaurantes',
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length] + 'bb'),
          borderColor:     sorted.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 2,
          borderRadius: 6,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Restaurantes por tipo de establecimiento',
            font: { size: 15, weight: 'bold' },
            color: '#333',
            padding: { bottom: 14 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.x} restaurantes`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#555' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          y: {
            ticks: { color: '#555' },
            grid: { display: false }
          }
        }
      }
    }));
  }

  // *************************************************************************
  // GRÁFICO 4 — Donut: top 10 localidades con más restaurantes
  //
  // TIPO: 'doughnut' (donut = variante del gráfico de sectores/pie con hueco)
  //   · 'pie' rellena todo el círculo.
  //   · 'doughnut' deja un hueco en el centro (visualmente más limpio).
  //   · NO usa escalas (scales), porque no hay ejes X/Y.
  //   · La leyenda es especialmente importante aquí porque los colores son
  //     la única forma de identificar cada sector.
  //
  // PREPARACIÓN DE DATOS:
  //   1. Contamos restaurantes por localidad con un Map.
  //   2. Convertimos a array, ordenamos de mayor a menor y tomamos los 10 primeros.
  //   3. Asignamos un color distinto a cada localidad usando PALETTE[i % 10].
  //
  // TOOLTIP CON PORCENTAJE:
  //   Calculamos el total sumando todos los valores del dataset y dividimos
  //   el valor del sector entre el total para obtener el porcentaje.
  //
  // LEYENDA A LA DERECHA (position: 'right'):
  //   Con 10 etiquetas, colocarla abajo ocuparía demasiado espacio vertical.
  //   A la derecha aprovecha el ancho de pantalla y el donut queda centrado.
  //
  // hoverOffset: cuando el usuario pone el cursor sobre un sector, éste se
  //   desplaza hacia afuera N píxeles, dando retroalimentación visual clara.
  // *************************************************************************
  private renderLocalidades(data: Restaurante[], canvas: HTMLCanvasElement) {
    this.destroyChart('localidades');

    const counts = new Map<string, number>();
    data.forEach(r => {
      const loc = r.locality?.trim() || 'Desconocida';
      counts.set(loc, (counts.get(loc) ?? 0) + 1);
    });

    const top10 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const PALETTE = [
      '#3880ff', '#2dd36f', '#eb445a', '#ffc409', '#5260ff',
      '#0cd1e8', '#f7a34b', '#a855f7', '#10dc60', '#92949c'
    ];

    this.charts.set('localidades', new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: top10.map(([k]) => k),
        datasets: [{
          data: top10.map(([, v]) => v),
          backgroundColor: top10.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'),
          borderColor:     top10.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 2,
          // hoverOffset: desplaza el sector N px hacia afuera al pasar el ratón
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { padding: 12, usePointStyle: true, font: { size: 12 }, color: '#333' }
          },
          title: {
            display: true,
            text: 'Top 10 localidades con más restaurantes',
            font: { size: 15, weight: 'bold' },
            color: '#333',
            padding: { bottom: 14 }
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                // Calculamos el total sumando todos los valores del dataset
                const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
                const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                return ` ${ctx.label}: ${ctx.parsed} restaurantes (${pct}%)`;
              }
            }
          }
        }
        // Los gráficos doughnut/pie no usan la propiedad 'scales'
      }
    }));
  }

  // *************************************************************************
  // ngOnDestroy — limpieza al destruir el componente
  //
  // Angular llama a este método justo antes de destruir el componente
  // (p.ej. cuando el usuario cambia de pestaña a "Tabla" o sale de la página).
  //
  // Es imprescindible destruir todas las instancias de Chart para:
  //  · Liberar la memoria que ocupan los datos y el canvas.
  //  · Eliminar los event listeners de redimensionado y hover.
  //  · Evitar memory leaks acumulativos si el usuario alterna vistas muchas veces.
  // *************************************************************************
  ngOnDestroy() {
    this.charts.forEach(c => c.destroy());
    this.charts.clear();
  }
}
