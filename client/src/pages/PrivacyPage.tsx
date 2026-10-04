import { useEffect } from 'react'
import './pages.css'

// Fecha de la última revisión del texto: cámbiala cada vez que cambie lo que
// la app recoge o cómo lo trata (y revisa que sigue siendo cierto — ver CLAUDE.md).
const LAST_UPDATED = '4 de octubre de 2026'

// Correo de contacto para asuntos de privacidad. Por defecto el del
// responsable del servicio; otra instalación puede cambiarlo al construir el
// cliente con VITE_PRIVACY_CONTACT.
const DEFAULT_CONTACT = 'faenabernat@gmail.com'
const CONTACT = (import.meta.env.VITE_PRIVACY_CONTACT as string | undefined)?.trim() || DEFAULT_CONTACT

const Logo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

export default function PrivacyPage() {
  useEffect(() => { document.title = 'Política de privacidad · Calendario Compartido' }, [])

  return (
    <main className="page">
      <a className="page-brand" href="/">
        <span className="page-brand-logo"><Logo /></span>
        Calendario Compartido
      </a>

      <article className="legal">
        <h1>Política de privacidad</h1>
        <p className="legal-updated">Última actualización: {LAST_UPDATED}</p>
        <p className="legal-lead">
          Calendario Compartido es una herramienta para organizarte con otras personas en una «sala»: un calendario,
          listas, notas y marcadores compartidos. <strong>No hay cuentas ni registro</strong>: se entra con el nombre
          y la contraseña de la sala. Aquí te explicamos, sin rodeos, qué datos se tratan y qué puedes hacer con ellos.
        </p>

        <h2>1. Quién es el responsable</h2>
        <p>
          El responsable del tratamiento es la persona o entidad que administra esta instalación del servicio.{' '}
          {CONTACT ? (
            <>Puedes escribirle a <a href={`mailto:${CONTACT}`}>{CONTACT}</a> para cualquier cuestión sobre tus datos.</>
          ) : (
            <>Para cualquier cuestión sobre tus datos, dirígete a quien te ha dado acceso a esta instalación.</>
          )}
        </p>

        <h2>2. Qué datos tratamos y para qué</h2>
        <ul>
          <li>
            <strong>La sala:</strong> su nombre y su contraseña. La contraseña se guarda en el servidor cifrada
            (con <code>scrypt</code> y sal aleatoria); nadie, ni quien administra el servicio, puede leerla. Sirve
            solo para dar acceso a la sala.
          </li>
          <li>
            <strong>Lo que escribes en la sala:</strong> eventos, listas, notas y marcadores (enlaces con su título,
            descripción y etiquetas). Lo ven todas las personas que tengan la contraseña de la sala.
          </li>
          <li>
            <strong>Tu identidad ligera:</strong> el nombre y el color que eliges tú mismo (puede ser un apodo). Se
            muestra a los demás miembros y se asocia a lo que editas («Editado por…», «Modificada por…»).
            Cualquiera puede escribir el nombre que quiera: no es una identidad verificada.
          </li>
          <li>
            <strong>Un identificador de dispositivo:</strong> un código aleatorio que genera tu navegador. Sirve para
            recordar qué dispositivos han entrado en la sala (la lista de miembros y «visto por última vez») y no
            contar dos veces a la misma persona si abre varias pestañas.
          </li>
          <li>
            <strong>Avisos (opcional):</strong> si activas las notificaciones, se guarda la suscripción de aviso de
            tu navegador para enviarte los recordatorios de los eventos. Puedes desactivarlas cuando quieras.
          </li>
          <li>
            <strong>Datos técnicos:</strong> tu dirección IP se usa para limitar abusos (demasiados intentos de acceso
            o conexiones). Ese control vive en la memoria del servidor y no se guarda en la base de datos, pero el
            alojamiento y los registros del servidor pueden conservar la IP y la hora de las conexiones y de los
            bloqueos por abuso.
          </li>
        </ul>
        <p>
          Base legal: prestarte el servicio que solicitas (art. 6.1.b RGPD); tu consentimiento para los avisos
          (art. 6.1.a); y el interés legítimo en mantener el servicio seguro frente a abusos (art. 6.1.f).
        </p>

        <h2>3. Qué se guarda en tu dispositivo</h2>
        <p>
          No usamos cookies, ni analítica, ni publicidad, ni rastreadores de terceros. Solo usamos el almacenamiento
          local de tu navegador, necesario para que la app funcione:
        </p>
        <ul>
          <li><code>identity</code> e <code>identity:&lt;sala&gt;</code>: tu nombre y color.</li>
          <li><code>deviceId</code>: el identificador de dispositivo.</li>
          <li>
            <code>rememberedRoom</code>: el nombre y la <strong>contraseña de la sala</strong>, para no tener que
            escribirlos al recargar. Se guardan en claro en tu navegador, así que{' '}
            <strong>pulsa «Salir de la sala» en los dispositivos compartidos o ajenos</strong>: borra esos datos.
          </li>
          <li><code>bookmarksView</code>: si prefieres ver los marcadores como tarjetas o como lista.</li>
        </ul>
        <p>Puedes borrar todo esto en cualquier momento desde los ajustes de tu navegador («datos del sitio»).</p>

        <h2>4. Los enlaces que guardas</h2>
        <p>
          Al guardar un marcador, <strong>el servidor visita esa página</strong> para leer su título, descripción e
          imagen. Las imágenes y los iconos que se ven en los marcadores los carga <strong>tu propio navegador</strong>{' '}
          directamente desde el sitio original, que por tanto puede ver tu dirección IP. No guardes enlaces con
          credenciales o datos secretos en la dirección.
        </p>

        <h2>5. Con quién se comparten los datos</h2>
        <ul>
          <li>Con las demás personas de tu sala: todo su contenido y los nombres de sus miembros.</li>
          <li>Con los proveedores de alojamiento del servidor y de esta web, que actúan por cuenta del responsable.</li>
          <li>Si activas los avisos, con el servicio de notificaciones de tu navegador (Google, Apple o Mozilla, según el caso).</li>
        </ul>
        <p>No vendemos ni cedemos tus datos a terceros ni los usamos para publicidad o perfiles.</p>

        <h2>6. Cuánto tiempo se conservan</h2>
        <ul>
          <li>Mientras la sala exista. Las salas <strong>sin ninguna actividad durante 2 años</strong> se eliminan solas.</li>
          <li>Los eventos que terminaron hace <strong>más de 3 años</strong> se eliminan solos.</li>
          <li>
            Se hacen copias de seguridad diarias y se guardan las últimas 14: lo que borres puede seguir en una copia
            hasta unas dos semanas.
          </li>
          <li>Al borrar un elemento hay unos segundos para deshacerlo; pasado ese plazo se descarta.</li>
        </ul>

        <h2>7. Seguridad</h2>
        <p>
          Las contraseñas se guardan cifradas, la conexión va cifrada (HTTPS) y el servidor limita los intentos de
          acceso, las conexiones y el volumen de datos por sala para frenar abusos. Aun así, al no haber cuentas,{' '}
          <strong>quien tenga el nombre y la contraseña de una sala accede a todo su contenido</strong>: elige una
          contraseña larga y compártela solo con quien corresponda.
        </p>

        <h2>8. Tus derechos</h2>
        <p>
          Puedes pedir acceso, rectificación, supresión, limitación u oposición al tratamiento, y la portabilidad de
          tus datos. Como no hay cuentas, para atender la solicitud necesitaremos el nombre de la sala y que
          demuestres que la conoces. Puedes exportar el calendario en formato <code>.ics</code> desde los ajustes de
          la sala. Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de
          Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">aepd.es</a>).
        </p>

        <h2>9. Menores</h2>
        <p>El servicio no está dirigido a menores de 14 años.</p>

        <h2>10. Cambios en esta política</h2>
        <p>
          Si cambia lo que la app recoge o cómo lo trata, actualizaremos este texto y la fecha de arriba. Te
          recomendamos revisarlo de vez en cuando.
        </p>

        <p className="legal-note">
          Este texto describe fielmente lo que hace la aplicación hoy. Si publicas el servicio para el público
          general o con fines comerciales, conviene que lo revise un profesional.
        </p>

        <a className="legal-back" href="/">← Volver a la app</a>
      </article>
    </main>
  )
}
