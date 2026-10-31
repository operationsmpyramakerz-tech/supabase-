/** Filter a canonical Products snapshot for the project-component picker.
 * Never return pricing or other private product metadata to the client.
 */
export function filterPreparingProductOptions(products,query="",limit=60) {
 const q=String(query||"").trim().slice(0,120).toLocaleLowerCase();
 return (Array.isArray(products)?products:[])
  .filter(product=>product?.id&&product?.name&&(!q||`${product.name} ${product.displayId||""}`.toLocaleLowerCase().includes(q)))
  .slice(0,limit)
  .map(product=>({id:product.id,name:product.name,displayId:product.displayId||""}));
}
