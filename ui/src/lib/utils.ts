import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short hex rendering for 32-byte hashes, commitments and salts. */
export function shortHex(bytes: Uint8Array, head = 6, tail = 4): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** Full hex, for the private-state panel where the whole value is the point. */
export function fullHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const fmt = (n: bigint | number): string => n.toLocaleString('en-US');
