import { useData } from '../data'
import { Section, DataTable } from '../components'

export default function Methodology() {
  const { data } = useData()
  if (!data) return null
  return (
    <div className="max-w-4xl">
      <h1 className="mb-3 font-display text-2xl font-bold">Información metodológica</h1>
      <Section title="Versiones del instrumento">
        <DataTable columns={['Versión', 'Estado', 'Descripción', 'Cambios']} rows={data.studies.map((s) => [s.version, s.status, s.description ?? '', <span className="text-xs">{s.changelog}</span>])} />
        <p className="mt-2 text-sm text-muted">Las observaciones de versiones distintas no son directamente comparables. Los datos 1.0.0 provienen del HTML original: no tienen orden de presentación ni puntos por noticia, y su puntuación fue calculada por el navegador del participante.</p>
      </Section>
      <Section title="Qué mide y qué no mide">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li><b>Mide</b> la capacidad de clasificar 10 titulares (5 reales, 5 falsos) como reales o falsos bajo presión de tiempo (20 s), con hasta 2 pistas.</li>
          <li><b>No mide</b> la conducta real de compartir. El botón «Real» se rotula también «La reenvío», pero la decisión es de clasificación: creer que algo es cierto no equivale a reenviarlo, y en la vida real se puede compartir algo falso a sabiendas (humor, alerta) o no compartir algo cierto.</li>
          <li><b>Acertar ≠ verificar.</b> Un acierto puede deberse a conocimiento previo de la noticia, intuición o azar (50% por noticia). La lupa es un indicador muy limitado de verificación.</li>
          <li><b>Azar:</b> respondiendo al azar, el número esperado de aciertos es 5 de 10 (binomial n=10, p=0,5: P(≥ 8) ≈ 5,5%).</li>
          <li><b>Conocimiento previo y fecha:</b> las noticias reales son de 2026; su reconocimiento depende de cuándo se juega. Resultados de distintos periodos no son comparables sin control.</li>
          <li><b>Retroalimentación durante el juego:</b> tras cada noticia se revela la respuesta, lo que puede generar aprendizaje dentro de la partida; la posición se registra (aleatoria) para poder estudiarlo.</li>
          <li><b>Influencia social:</b> la versión 1.0.0 mostraba el % de personas que se equivocó antes; en 2.0.0 está desactivado por defecto para no condicionar respuestas.</li>
          <li><b>Pregunta posterior:</b> «¿Cambiarías tu forma de compartir?» mide intención declarada inmediatamente después de jugar (sujeta a deseabilidad social), no cambio de conducta.</li>
          <li><b>Muestra:</b> autoseleccionada, sin datos demográficos; no permite generalizar ni comparar subgrupos poblacionales.</li>
          <li><b>Alcance simulado:</b> número aleatorio (900–5099 por falsa aceptada) con fin pedagógico. No es una medición ni una estimación de difusión real.</li>
        </ul>
      </Section>
      <Section title="Regla de puntuación (calculada en el servidor)">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Acierto: 100 puntos + bono de velocidad = máx(0, redondeo(50 × (1 − t/20 s))).</li>
          <li>Racha: si hay 2 o más aciertos seguidos, se multiplica por (mín(racha, 4) / 2 + 0,5): ×1,5 con 2, ×2 con 3, ×2,5 con 4 o más.</li>
          <li>Con lupa: el resultado se multiplica por 0,8. Error o tiempo agotado: 0 puntos y la racha vuelve a 0.</li>
          <li>Tiempo agotado: sin respuesta en 20 s, o respuesta recibida con más de 21,5 s (tolerancia de 1,5 s).</li>
        </ul>
      </Section>
      <Section title="Privacidad y anonimato">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>No se recolectan nombres, correos, teléfonos ni direcciones IP en las tablas del estudio. Cada sesión usa un UUID aleatorio generado en el dispositivo.</li>
          <li>La infraestructura (Supabase y el hosting) registra temporalmente IP en sus bitácoras técnicas; el equipo no las usa para el análisis.</li>
          <li>Las respuestas abiertas pueden contener información identificable escrita por la persona: revísalas antes de citarlas.</li>
          <li>Conservación propuesta: sesiones incompletas y de prueba se eliminan tras 90 días; datos completos se conservan mientras dure el proyecto y luego se anonimiza el texto libre.</li>
        </ul>
      </Section>
    </div>
  )
}
