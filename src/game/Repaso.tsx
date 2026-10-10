import { marcasDe, repaso, resaltar, type Resultado } from './trucos'

/** Repaso final (prototipo en el sandbox): los trucos que más le funcionaron al jugador, con el titular donde estaban. */
export function Repaso({ resultados }: { resultados: Resultado[] }) {
  const { cayo, items } = repaso(resultados)
  if (items.length === 0) return null
  return (
    <section aria-labelledby="repaso-titulo" className="rounded-[20px] bg-white p-[18px] text-ink">
      <h2 id="repaso-titulo" className="font-display text-xl font-extrabold">{cayo ? 'Los trucos que te funcionaron' : '¡No caíste! Estos son los trucos que esquivaste'}</h2>
      <p className="mt-1 text-sm text-muted">{cayo ? 'Toca cada uno para ver dónde estaba y cómo pillarlo la próxima vez.' : 'Toca cada uno para ver cómo funcionan.'}</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {items.map(({ truco, ejemplos }, i) => (
          <details key={truco.id} open={i === 0} className="group rounded-2xl border-2 border-soft open:border-u">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="text-3xl leading-none">{truco.emoji}</span>
              <span className="flex-1">
                <b className="block font-display text-[17px]">{truco.nombre}</b>
                {cayo && <span className="text-xs text-muted">{ejemplos.length === 1 ? 'Te funcionó 1 vez' : `Te funcionó ${ejemplos.length} veces`}</span>}
              </span>
              <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-3 pb-3.5">
              <figure className="flex gap-2.5 rounded-xl bg-[#F5F1F8] p-2.5">
                {ejemplos[0].thumb && <img src={ejemplos[0].thumb} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                <div className="text-sm leading-snug">
                  <blockquote className="font-semibold">
                    {ejemplos[0].isReal
                      ? <>«{ejemplos[0].headline}» <span className="font-normal text-muted">(era real)</span></>
                      : <>«{resaltar(ejemplos[0].headline, ejemplos[0].key, truco.id).map((p, j) => p.mark
                          ? <mark key={j} className="rounded bg-gold px-0.5 text-ink">{p.text}</mark>
                          : <span key={j}>{p.text}</span>)}»</>}
                  </blockquote>
                  {!ejemplos[0].isReal && marcasDe(ejemplos[0].key, truco.id).length === 0 && (
                    <p className="mt-1 text-xs text-muted">Fíjate en lo que falta: no dice qué medio o institución lo publicó.</p>
                  )}
                </div>
              </figure>
              <p className="mt-2.5 text-sm"><b>Por qué funciona.</b> {truco.porQue}</p>
              <p className="mt-2 rounded-xl bg-[#E8F5E9] p-2.5 text-sm"><b>Cómo pillarlo en 10 segundos.</b> {truco.comoPillarlo}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
