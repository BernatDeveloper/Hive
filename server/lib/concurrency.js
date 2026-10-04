// Limita cuántas tareas asíncronas corren a la vez y cuántas esperan turno. Si
// la cola está llena, `run` rechaza con un error de código 'BUSY': mejor decir
// "servidor ocupado" que acumular trabajo sin límite.
//
// Se usa en las operaciones de scrypt (hash de contraseña): son costosas a
// propósito y salen al pool de hilos de libuv, que comparten el DNS de la
// vista previa de enlaces y el sistema de ficheros. Una avalancha de intentos
// de acceso desde muchas IPs (que el límite por IP no ve) no debe dejar al
// resto del servidor sin hilos.
export function createConcurrencyLimiter({ concurrency, maxQueue }) {
  let running = 0
  const queue = []

  function next() {
    if (running >= concurrency) return
    const item = queue.shift()
    if (!item) return
    running++
    // Promise.resolve().then: si la tarea lanza de forma síncrona, también se captura.
    Promise.resolve().then(() => item.task()).then(item.resolve, item.reject).finally(() => {
      running--
      next()
    })
  }

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        if (running >= concurrency && queue.length >= maxQueue) {
          const busy = new Error('Servidor ocupado')
          busy.code = 'BUSY'
          return reject(busy)
        }
        queue.push({ task, resolve, reject })
        next()
      })
    },
    stats: () => ({ running, queued: queue.length }),
  }
}
