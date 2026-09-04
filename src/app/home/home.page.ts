// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS — Angular core
// ─────────────────────────────────────────────────────────────────────────────
import { Component, signal, computed, inject, viewChild } from '@angular/core';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS — Ionic: módulo de componentes UI y controladores de overlays
// ─────────────────────────────────────────────────────────────────────────────
import { IonicModule } from '@ionic/angular';
import { AlertController, ToastController, LoadingController, ModalController } from '@ionic/angular';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS — Iconos de Ionicons
// addIcons() registra los iconos para que sean usables en el HTML por nombre
// ─────────────────────────────────────────────────────────────────────────────
import { addIcons } from 'ionicons';
import {
  star, sunny, cloudUploadOutline, restaurantOutline,
  closeCircleOutline, searchOutline, filterOutline, trashOutline,
  globeOutline, warningOutline, informationCircleOutline,
  downloadOutline, lockClosedOutline, addOutline, arrowUpOutline, arrowDownOutline,
  barChartOutline, listOutline, documentTextOutline
} from 'ionicons/icons';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS — Interfaz, servicio y datos locales del proyecto
// ─────────────────────────────────────────────────────────────────────────────
import { Restaurante } from '../interface/restaurante';
import { RestauranteService } from '../services/restaurante.service';
import { InformeService } from '../services/informe.service';
import { AddRestauranteModalComponent } from '../components/add-restaurante-modal/add-restaurante-modal.component';
import { GraficosComponent } from '../components/graficos/graficos.component';
import restaurantesJSON from '../../assets/datos/restaurantes.json';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, GraficosComponent],
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})
export class HomePage {

  // ─────────────────────────────────────────────────────────────────────────
  // INYECCIÓN DE DEPENDENCIAS
  // inject() es la forma moderna de inyectar servicios en componentes standalone.
  // Es equivalente a declararlos como parámetros en el constructor.
  // ─────────────────────────────────────────────────────────────────────────
  restauranteService = inject(RestauranteService);
  informeService     = inject(InformeService);
  alertCtrl          = inject(AlertController);
  toastCtrl          = inject(ToastController);
  loadingCtrl        = inject(LoadingController);
  modalCtrl          = inject(ModalController);

  // ─────────────────────────────────────────────────────────────────────────
  // DATOS LOCALES
  // Restaurantes leídos directamente del JSON local (usados para la importación)
  // ─────────────────────────────────────────────────────────────────────────
  restaurantes: Restaurante[] = restaurantesJSON as Restaurante[];

  // ─────────────────────────────────────────────────────────────────────────
  // ESTADO — Signals
  // Los signals son la forma reactiva de Angular para gestionar el estado.
  // Cuando cambia el valor de un signal, la vista se actualiza automáticamente.
  // Se leen llamándolos como función: signal()  |  Se actualizan con: signal.set(valor)
  // ─────────────────────────────────────────────────────────────────────────

  /** Lista de restaurantes obtenidos de Firebase */
  restaurantesCargados = signal<Restaurante[]>([]);

  /** Texto introducido en la barra de búsqueda */
  textoBusqueda = signal('');

  /** Territorios seleccionados en el selector de filtro */
  territoriosSeleccionados = signal<string[]>([]);

  /** Localidades seleccionadas para filtrar */
  localidadesSeleccionadas = signal<string[]>([]);

  /** H1: bloquea todos los botones mientras hay una petición activa a Firebase */
  cargando = signal(false);

  /** H1: bloquea botones y muestra overlay LoadingController durante la importación masiva */
  importando = signal(false);

  /** Mensaje descriptivo del estado actual de la carga */
  estadoCarga = signal('');

  /** Mensaje descriptivo del estado actual de la importación */
  estadoImportacion = signal('');

  /** H7: columna y dirección de ordenación activa; los cambios se propagan automáticamente a restaurantesFiltrados */
  sortColumna = signal<string>('');
  sortDireccion = signal<'asc' | 'desc'>('asc');

  /** Vista activa del segment: tabla o gráficos */
  vistaActual = signal<'tabla' | 'graficos'>('tabla');

  /** H1: bloquea el botón mientras se genera el informe PDF en el backend */
  generandoInforme = signal(false);

  /** Referencia al componente de gráficas para leer sus imágenes ya dibujadas */
  private graficos = viewChild<GraficosComponent>('graficos');

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR
  // Se ejecuta al instanciar el componente.
  // Registramos aquí los iconos para que estén disponibles en el HTML.
  // ─────────────────────────────────────────────────────────────────────────
  constructor() {
    addIcons({
      star, sunny, cloudUploadOutline, restaurantOutline,
      closeCircleOutline, searchOutline, filterOutline, trashOutline,
      globeOutline, warningOutline, informationCircleOutline,
      downloadOutline, lockClosedOutline, addOutline, arrowUpOutline, arrowDownOutline,
      barChartOutline, listOutline, documentTextOutline
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DATOS DERIVADOS — Computed
  // computed() crea valores que se recalculan automáticamente solo cuando
  // cambia alguno de los signals de los que dependen. Son de solo lectura.
  // ─────────────────────────────────────────────────────────────────────────

  /** True si hay al menos un restaurante cargado */
  hayDatos = computed(() => this.restaurantesCargados().length > 0);

  /** True si hay algún filtro activo (texto, territorio o localidades) */
  hayFiltrosActivos = computed(() =>
    !!this.textoBusqueda() ||
    this.territoriosSeleccionados().length > 0 ||
    this.localidadesSeleccionadas().length > 0
  );

  /** Territorios disponibles filtrados por los restaurantes cargados */
  territoriosFiltrados = computed(() => {
    const territorios = this.restaurantesCargados().map(r => r.territory);
    return Array.from(new Set(territorios)).sort();
  });

  /** Localidades disponibles filtradas por el territorio seleccionado */
  localidadesFiltradasPorTerritorio = computed(() => {
    let lista = this.restaurantesCargados();
    const territorios = this.territoriosSeleccionados().map(t => t.toLowerCase().trim());
    if (territorios.length > 0) {
      lista = lista.filter(r => territorios.includes(r.territory?.toLowerCase().trim() ?? ''));
    }
    const localities = lista.map(r => r.locality?.trim()).filter((l): l is string => !!l);
    return Array.from(new Set(localities)).sort();
  });

  /** Restaurantes resultantes tras aplicar todos los filtros activos */
  restaurantesFiltrados = computed(() => {
    let lista = this.restaurantesCargados();

    const texto = this.textoBusqueda().toLowerCase().trim();
    if (texto) {
      lista = lista.filter(r => r.documentName.toLowerCase().includes(texto));
    }

    const territorios = this.territoriosSeleccionados().map(t => t.toLowerCase().trim());
    if (territorios.length > 0) {
      lista = lista.filter(r => territorios.includes(r.territory?.toLowerCase().trim() ?? ''));
    }

    const seleccionadas = this.localidadesSeleccionadas();
    if (seleccionadas.length > 0) {
      lista = lista.filter(r => seleccionadas.includes(r.locality?.trim() || ''));
    }

    const col = this.sortColumna();
    if (col) {
      const dir = this.sortDireccion() === 'asc' ? 1 : -1;
      lista = [...lista].sort((a, b) => {
        const va = String((a as any)[col] ?? '').toLowerCase();
        const vb = String((b as any)[col] ?? '').toLowerCase();
        if (va < vb) return -dir;
        if (va > vb) return dir;
        return 0;
      });
    }

    return lista;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS
  // Un getter expone un valor calculado como si fuera una propiedad normal.
  // Se accede sin paréntesis desde el HTML: localidadesSeleccionadasArray
  // ─────────────────────────────────────────────────────────────────────────

  /** Devuelve las localidades seleccionadas como array para usarlo en el HTML */
  get localidadesSeleccionadasArray(): string[] {
    return this.localidadesSeleccionadas();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODOS DE FILTRADO
  // Responden a los eventos del usuario en los controles de filtro y
  // actualizan los signals correspondientes.
  // ─────────────────────────────────────────────────────────────────────────

  /** Se ejecuta al cambiar el selector de territorio */
  onTerritorioChange(value: string[]) {
    this.territoriosSeleccionados.set(value ?? []);
    const nuevasLocalidades = this.localidadesSeleccionadas().filter(loc =>
      this.localidadesFiltradasPorTerritorio().includes(loc)
    );
    this.localidadesSeleccionadas.set(nuevasLocalidades);
  }

  /** Se ejecuta al cambiar el selector de localidades */
  onLocalidadesChange(value: string[]) {
    this.localidadesSeleccionadas.set(value);
  }

  /** Elimina todas las localidades seleccionadas */
  limpiarLocalidades() {
    this.localidadesSeleccionadas.set([]);
  }

  /** Elimina una localidad concreta del conjunto de seleccionadas */
  eliminarLocalidad(loc: string) {
    this.localidadesSeleccionadas.set(
      this.localidadesSeleccionadas().filter(l => l !== loc)
    );
  }

  /** Restablece todos los filtros a su estado inicial */
  limpiarTodosFiltros() {
    this.textoBusqueda.set('');
    this.territoriosSeleccionados.set([]);
    this.localidadesSeleccionadas.set([]);
  }

  limpiarTerritorios() {
    this.territoriosSeleccionados.set([]);
    this.localidadesSeleccionadas.set([]);
  }

  eliminarTerritorio(t: string) {
    this.territoriosSeleccionados.update(arr => arr.filter(x => x !== t));
    const validas = this.localidadesFiltradasPorTerritorio();
    this.localidadesSeleccionadas.set(
      this.localidadesSeleccionadas().filter(loc => validas.includes(loc))
    );
  }

  /** Alterna columna y dirección de ordenación al pulsar un encabezado de tabla */
  cambiarOrden(columna: string) {
    if (this.sortColumna() === columna) {
      this.sortDireccion.set(this.sortDireccion() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumna.set(columna);
      this.sortDireccion.set('asc');
    }
  }

  cambiarVista(valor: any) {
    if (valor === 'tabla' || valor === 'graficos') {
      this.vistaActual.set(valor);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODOS DE DATOS — Operaciones con Firebase (async/await)
  // Son asíncronos porque las llamadas a Firebase devuelven Promises.
  // Se usa try/catch/finally para gestionar errores y limpiar el estado.
  // ─────────────────────────────────────────────────────────────────────────

  /** Obtiene todos los restaurantes de Firebase y los guarda en el signal */
  async cargarDatos() {
    this.cargando.set(true);
    this.estadoCarga.set('Cargando restaurantes...');

    try {
      const lista = await this.restauranteService.getAll();
      this.restaurantesCargados.set(lista);
      this.estadoCarga.set('');
      await this.mostrarToast(`✅ ${lista.length} restaurantes cargados`, 'success');

    } catch (error: any) {
      console.error('Error al cargar datos:', error);
      this.estadoCarga.set('');
      const msg = error?.code === 'permission-denied'
        ? '❌ Sin permisos en Firebase. Revisa las reglas de seguridad.'
        : '❌ Error al cargar datos. Revisa tu conexión a internet.';
      await this.mostrarToast(msg, 'danger');
    } finally {
      // finally siempre se ejecuta, haya error o no
      this.cargando.set(false);
    }
  }

  /** Muestra un diálogo de confirmación antes de iniciar la importación */
  async confirmarImportacion() {
    const alert = await this.alertCtrl.create({
      header: '⚠️ Confirmar actualización',
      message: `Esta acción borrará <strong>${this.restaurantes.length} restaurantes</strong>
                actuales y los reemplazará con los datos del archivo local. ¿Deseas continuar?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sí, actualizar', role: 'confirm', handler: () => this.importarJSON() }
      ]
    });
    await alert.present();
  }

  /** Borra todos los datos de Firebase y sube los restaurantes del JSON local */
  async importarJSON() {
    this.importando.set(true);

    const loading = await this.loadingCtrl.create({
      message: 'Borrando datos anteriores...',
      backdropDismiss: false
    });
    await loading.present();

    try {
      await this.restauranteService.deleteAll();

      loading.message = 'Subiendo restaurantes...';
      this.estadoImportacion.set('Subiendo restaurantes...');

      await this.restauranteService.addAll(this.restaurantes);

      await loading.dismiss();
      this.estadoImportacion.set('');
      await this.mostrarToast('✅ Restaurantes actualizados correctamente', 'success');

    } catch (error: any) {
      await loading.dismiss();
      console.error('Error al importar JSON:', error);
      this.estadoImportacion.set('');
      const msg = error?.code === 'permission-denied'
        ? '❌ Sin permisos en Firebase. Revisa las reglas de seguridad.'
        : '❌ Error al actualizar. Revisa tu conexión a internet.';
      await this.mostrarToast(msg, 'danger');
    } finally {
      this.importando.set(false);
    }
  }

  /** Descarga todos los restaurantes de Firebase como fichero JSON */
  async exportarJSON() {
    const datos = await this.restauranteService.getAll();
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restaurantes_backup.json';
    a.click();
  }

  /**
   * Genera el informe PDF: recoge las gráficas ya dibujadas como imágenes
   * (toBase64Image) y se las manda junto a la tabla al backend Puppeteer,
   * que devuelve el PDF listo para descargar.
   */
  async generarInformePDF() {
    this.generandoInforme.set(true);
    try {
      const imagenes = this.graficos()?.obtenerImagenes() ?? {};
      await this.informeService.generarInformePDF(this.restaurantesFiltrados(), imagenes);
      await this.mostrarToast('Informe generado correctamente.', 'success');
    } catch {
      await this.mostrarToast('No se pudo generar el informe. ¿Está el servidor de informes en marcha?', 'danger');
    } finally {
      this.generandoInforme.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODOS AUXILIARES — Notificaciones UI
  // ─────────────────────────────────────────────────────────────────────────

  /** H9: errores y avisos usan duration:0 (no desaparecen solos); éxitos desaparecen a los 3s */
  private async mostrarToast(mensaje: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: color === 'success' ? 3000 : 0,
      color,
      position: 'bottom',
      buttons: [{ text: 'X', role: 'cancel' }]
    });
    await toast.present();
  }

  /** H3: permite recuperar un restaurante borrado por error durante 6 segundos */
  private async mostrarToastConDeshacer(r: Restaurante) {
    const toast = await this.toastCtrl.create({
      message: `${r.documentName} eliminado`,
      duration: 6000,
      color: 'success',
      position: 'bottom',
      buttons: [
        {
          text: 'Deshacer',
          handler: async () => {
            try {
              await this.restauranteService.add(r);
              await this.cargarDatos();
            } catch {
              await this.mostrarToast('Error al deshacer el borrado. Revisa tu conexión.', 'danger');
            }
          }
        }
      ]
    });
    await toast.present();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODOS DE UTILIDAD — Transformaciones de datos para el HTML
  // Array.from({ length: n }) crea un array de n elementos.
  // Se usa para repetir iconos (estrellas/soles) con *ngFor en la vista.
  // ─────────────────────────────────────────────────────────────────────────

  /** Devuelve un array de n elementos para iterar n estrellas Michelin en el HTML */
  estrellasMichelin(r: Restaurante): number[] {
    const count = Number(r.michelinStar) || 0;
    return Array.from({ length: count }, (_, i) => i);
  }

  /** Devuelve un array de n elementos para iterar n soles Repsol en el HTML */
  repsolSoles(r: Restaurante): number[] {
    const n = Number(r.repsolSun) || 0;
    return Array.from({ length: n }, (_, i) => i);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODOS CRUD — Añadir y borrar restaurantes individuales
  // ─────────────────────────────────────────────────────────────────────────

  /** Abre el modal para añadir un restaurante nuevo */
  async abrirModalAnadir() {
    const modal = await this.modalCtrl.create({
      component: AddRestauranteModalComponent,
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      await this.cargarDatos();
    }
  }

  /** Pide confirmación y borra el restaurante indicado de Firebase */
  async borrarRestaurante(r: Restaurante) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar borrado',
      subHeader: `¿Deseas borrar el restaurante ${r.documentName}?`,
      message: 'Este proceso es irreversible',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar', role: 'confirm', cssClass: 'danger',
          handler: async () => {
            if (!r.id) {
              await this.mostrarToast('No se puede borrar: el restaurante no tiene ID.', 'danger');
              return;
            }
            const loading = await this.loadingCtrl.create({ message: 'Borrando restaurante...' });
            await loading.present();
            try {
              await this.restauranteService.delete(r.id);
              this.restaurantesCargados.update(lista => lista.filter(x => x.id !== r.id));
              await loading.dismiss();
              await this.mostrarToastConDeshacer(r);
            } catch {
              await loading.dismiss();
              this.mostrarToast('Error al borrar el restaurante. Revisa tu conexión.', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }
}