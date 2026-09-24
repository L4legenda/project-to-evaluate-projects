// Vite отдаёт URL файла при импорте с суффиксом ?url (нужно для воркера PDF.js).
declare module "*?url" {
  const url: string;
  export default url;
}
