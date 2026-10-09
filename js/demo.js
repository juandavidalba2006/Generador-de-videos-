// Anillo solitario de ejemplo (para probar el estudio sin tener un STL a la mano). Medidas en milímetros.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const limpio = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k); return n; };

export function anilloEjemplo() {
  const piezas = [];
  // aro: perfil cómodo (media caña), 17 mm de diámetro interior
  const aro = new THREE.TorusGeometry(9.3, 1.0, 40, 220); aro.scale(1, 1, 1.9); piezas.push(aro);
  // canasta que sostiene la piedra
  const yP = 12.6;
  const canasta = new THREE.TorusGeometry(2.4, 0.32, 16, 64); canasta.rotateX(Math.PI / 2); canasta.translate(0, yP - 1.3, 0); piezas.push(canasta);
  const base = new THREE.TorusGeometry(1.5, 0.3, 16, 48); base.rotateX(Math.PI / 2); base.translate(0, yP - 2.6, 0); piezas.push(base);
  // seis garras que abrazan el filetín
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + Math.PI / 6, p0 = new THREE.Vector3(Math.cos(a) * 1.4, yP - 3.2, Math.sin(a) * 1.4), p1 = new THREE.Vector3(Math.cos(a) * 3.05, yP + 0.55, Math.sin(a) * 3.05);
    const curva = new THREE.QuadraticBezierCurve3(p0, new THREE.Vector3(Math.cos(a) * 3.4, yP - 1.2, Math.sin(a) * 3.4), p1);
    piezas.push(new THREE.TubeGeometry(curva, 20, 0.34, 10, false));
    const punta = new THREE.SphereGeometry(0.4, 14, 10); punta.translate(p1.x * 0.97, p1.y + 0.05, p1.z * 0.97); piezas.push(punta);
  }
  const metal = mergeGeometries(piezas.map(limpio));
  // talla brillante redonda: corona, filetín y pabellón con facetas
  const perfil = [new THREE.Vector2(0, -2.8), new THREE.Vector2(1.6, -1.45), new THREE.Vector2(3.2, -0.05), new THREE.Vector2(3.2, 0.1), new THREE.Vector2(2.55, 0.62), new THREE.Vector2(1.7, 1.1), new THREE.Vector2(0, 1.1)];
  const piedra = limpio(new THREE.LatheGeometry(perfil, 16)); piedra.translate(0, yP, 0);
  return { metal, piedra };
}
