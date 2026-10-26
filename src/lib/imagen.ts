/** Reduce una foto a máx. `lado` px por lado en JPEG. Si no se puede (formato raro, sin canvas), regresa el archivo original. */
export async function comprimirImagen(file: File, lado = 1280, calidad = 0.75): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", calidad));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
