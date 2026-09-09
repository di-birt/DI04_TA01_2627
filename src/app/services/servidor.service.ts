// *****************************************************************************
// ServidorService — primer contacto con el backend (carpeta /server).
//
// Este servicio no hace nada complicado a propósito: solo envía un mensaje por
// POST y devuelve la respuesta del servidor. El objetivo de esta tarea es
// entender el ciclo petición → respuesta con HttpClient, no construir PDFs.
// *****************************************************************************
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Forma de la respuesta que envía la ruta /api/eco del servidor.
export interface RespuestaEco {
  mensaje: string;
  recibidoEn: string;
}

@Injectable({ providedIn: 'root' })
export class ServidorService {

  private http = inject(HttpClient);

  // Envía el mensaje escrito por el usuario al servidor y devuelve el
  // Observable sin suscribirse aquí; quien llame a este método decide cuándo
  // ejecutar la petición y cómo tratar el resultado.
  probarConexion(mensaje: string): Observable<RespuestaEco> {
    return this.http.post<RespuestaEco>(`${environment.informesApiUrl}/api/eco`, { mensaje });
  }
}
