interface SunatSearchParams {
  searchTerm: string;
  value: string;
}

export const searchDocument = async ({ searchTerm, value }: SunatSearchParams) => {
  const url = process.env.RUC_API_URL ?? "https://facturacion-api.lobitoconsulting.es";
  // Aseguramos quitar un posible /api extra al final de la URL si lo hubiera
  const baseUrl = url.replace(/\/api$/, "");
  const endpoint = `${baseUrl}/api/ruc?searchTerm=${searchTerm}&value=${value}`;
  
  const response = await fetch(endpoint);
  
  if (!response.ok) {
    throw new Error("Error al consultar la API externa");
  }
  
  return response.json();
};
