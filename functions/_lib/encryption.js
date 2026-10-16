function b64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function getKey(env){
 if(!env.ACCOUNT_ENCRYPTION_KEY) throw new Error('Server setup incomplete: ACCOUNT_ENCRYPTION_KEY secret is missing.');
 let raw;try{raw=unb64(env.ACCOUNT_ENCRYPTION_KEY)}catch{throw new Error('ACCOUNT_ENCRYPTION_KEY must be base64-encoded 32-byte key.');}
 if(raw.length!==32) throw new Error('ACCOUNT_ENCRYPTION_KEY must decode to exactly 32 bytes.');
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptAccount(account,env){
 const key=await getKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(account));
 return b64(new Uint8Array([...iv,...new Uint8Array(ciphertext)]));
}
export async function decryptAccount(value,env){
 if(!value)return null;
 const packed=unb64(value),iv=packed.slice(0,12),data=packed.slice(12),key=await getKey(env);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data);
 return new TextDecoder().decode(plain);
}
