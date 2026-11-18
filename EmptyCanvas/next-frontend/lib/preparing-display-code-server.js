import "server-only";
import {getProductsList} from "./products-service";
import {preparingDisplayCodeResolver,withPreparingDisplayCodes} from "./preparing-display-code.mjs";
// Catalog failures must not block a stage or report. Preserve the old reference as a fallback.
export async function enrichPreparingDisplayCodes(data,keys=["items"]){
 const resolve=preparingDisplayCodeResolver(await getProductsList().catch(()=>[]));
 return {...data,...Object.fromEntries(keys.map(k=>[k,withPreparingDisplayCodes(data[k],resolve)]))};
}
