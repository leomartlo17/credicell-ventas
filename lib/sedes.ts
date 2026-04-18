/**
 * Configuración de sedes CREDICELL.
 * Cada sede apunta a un libro de Google Sheets y tiene una lista de asesores autorizados.
 *
 * Cuando agregues una sede nueva:
 *   1. Duplica el libro de San Esteban y quédate con una copia para la sede.
 *   2. Agrega la entrada abajo con el ID del libro (de la URL).
 *   3. Agrega los emails de los asesores de esa sede.
 *   4. Comparte el libro con el email de la Service Account como Editor.
 */

export type Sede = {
  id: string;
  nombre: string;
  libroId: string;
  asesores: string[]; // emails de Google
  admins: string[]; // emails de admins que autorizan valores (J.A, J.D)
};

export const SEDES: Sede[] = [
  {
    id: "san-esteban",
    nombre: "CREDICELL San Esteban",
    libroId: process.env.LIBRO_SAN_ESTEBAN || "",
    asesores: [
      "leomartlo17@gmail.com", // Leonardo — acceso como asesor también para probar el flujo de venta end-to-end
      // Agregar aquí los emails de las asesoras de San Esteban cuando se asignen
      // Ej: "paula.credicell@gmail.com"
    ],
    admins: [
      "leomartlo17@gmail.com", // Leonardo — dueño / admin principal
    ]
  },
  // PITALITO — desactivado por ahora, se activa en fase multi-sede
  // {
  //   id: "pitalito",
  //   nombre: "CREDICELL Pitalito",
  //   libroId: process.env.LIBRO_PITALITO || "",
  //   asesores: [],
  //   admins: []
  // }
];

/**
 * Dado el email de un usuario, devuelve la sede a la que pertenece.
 * Retorna null si el email no tiene acceso a ninguna sede.
 */
export function sedeDelUsuario(email: string): Sede | null {
  const e = email.toLowerCase().trim();
  return (
    SEDES.find((s) => s.asesores.map((x) => x.toLowerCase()).includes(e)) || null
  );
}

/**
 * ¿Es admin (puede autorizar valores)?
 */
export function esAdmin(email: string): boolean {
  const e = email.toLowerCase().trim();
  return SEDES.some((s) => s.admins.map((x) => x.toLowerCase()).includes(e));
}
