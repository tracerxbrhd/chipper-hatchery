export function telegramInitials(firstName: string, lastName: string) {
  const first = Array.from(firstName.trim())[0] ?? '';
  const last = Array.from(lastName.trim())[0] ?? '';
  return `${first}${last}`.toLocaleUpperCase('ru') || 'Ч';
}
