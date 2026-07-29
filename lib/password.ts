import bcrypt from "bcryptjs";

/**
 * Contraseñas para el login alternativo (usuarios sin cuenta de Google).
 * Regla: SIEMPRE bcrypt (hash lento, resistente a fuerza bruta); el texto
 * plano nunca se guarda ni se loguea.
 */

const ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

/** Política mínima: 8+ caracteres con al menos una letra y un número. */
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (!/[a-zA-Z]/.test(plain) || !/\d/.test(plain)) {
    return "La contraseña debe combinar letras y números.";
  }
  return null;
}
