'use client';
export function MoneyInput({label,value,onChange,readOnly=false}:{label:string;value:number;onChange:(n:number)=>void;readOnly?:boolean}){
 const format=(n:number)=>n?new Intl.NumberFormat('id-ID').format(n):'';
 return <label className="field">{label}<div className="currency-input"><span>Rp</span><input aria-label={label} inputMode="numeric" readOnly={readOnly} placeholder="Nominal" value={format(value)} onChange={e=>{const digits=e.target.value.replace(/\D/g,'');const n=Number(digits);if(n>1e12)return;onChange(n);}}/></div></label>;
}
export function IntegerInput({label,value,onChange,min=0,max=31,required=false}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;required?:boolean}){return <label className="field">{label}<input type="number" min={min} max={max} required={required} value={value||''} onChange={e=>onChange(e.target.value===''?0:Number(e.target.value))}/></label>;}
