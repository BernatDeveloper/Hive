import { useEffect, useState } from 'react'
import { socket, emitWrite, emitWriteAck } from '../../socket'
import type { List, ListItem, UndoOffer } from '../../types'
import { getIdentity } from '../identity/identity'

// Estado del módulo de listas: listas y sus ítems. Refresca ambas colecciones
// desde `access-granted` (reconexión).
export function useLists(room: string, initialLists: List[], initialItems: ListItem[]) {
  const [lists, setLists] = useState<List[]>(initialLists)
  const [listItems, setListItems] = useState<ListItem[]>(initialItems)

  useEffect(() => {
    // Dedupe en las altas: `undo-delete` re-emite *-created para restaurar.
    function onListCreated(list: List) { setLists(prev => prev.some(l => l.id === list.id) ? prev : [...prev, list]) }
    function onListUpdated(list: List) { setLists(prev => prev.map(l => l.id === list.id ? list : l)) }
    function onListDeleted(id: string) { setLists(prev => prev.filter(l => l.id !== id)) }
    function onListCloned(payload: { list: List; items: ListItem[] }) {
      setLists(prev => prev.some(l => l.id === payload.list.id) ? prev : [...prev, payload.list])
      setListItems(prev => [...prev, ...payload.items])
    }
    function onItemCreated(item: ListItem) { setListItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]) }
    function onItemUpdated(item: ListItem) { setListItems(prev => prev.map(i => i.id === item.id ? item : i)) }
    function onItemDeleted(id: string) { setListItems(prev => prev.filter(i => i.id !== id)) }
    function onItemsDeleted(payload: { ids: string[] }) { setListItems(prev => prev.filter(i => !payload.ids.includes(i.id))) }
    function onGranted(payload: { lists: List[]; listItems: ListItem[] }) {
      setLists(payload.lists)
      setListItems(payload.listItems)
    }

    socket.on('list-created', onListCreated)
    socket.on('list-updated', onListUpdated)
    socket.on('list-deleted', onListDeleted)
    socket.on('list-cloned', onListCloned)
    socket.on('list-item-created', onItemCreated)
    socket.on('list-item-updated', onItemUpdated)
    socket.on('list-item-deleted', onItemDeleted)
    socket.on('list-items-deleted', onItemsDeleted)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('list-created', onListCreated)
      socket.off('list-updated', onListUpdated)
      socket.off('list-deleted', onListDeleted)
      socket.off('list-cloned', onListCloned)
      socket.off('list-item-created', onItemCreated)
      socket.off('list-item-updated', onItemUpdated)
      socket.off('list-item-deleted', onItemDeleted)
      socket.off('list-items-deleted', onItemsDeleted)
      socket.off('access-granted', onGranted)
    }
  }, [])

  // Cada acción que modifica la lista lleva la identidad de dispositivo
  // (nombre/color): el servidor la guarda como "última modificación" de la
  // lista y la difunde en `list-updated`. Se lee fresca en cada acción para no
  // reenviar un nombre desactualizado si la persona se renombró.
  const who = () => {
    const identity = getIdentity(room)
    return { editor_name: identity.name, editor_color: identity.color }
  }

  return {
    lists,
    listItems,
    createList: (title: string) => emitWrite('create-list', { room, title, ...who() }),
    updateListTitle: (id: string, title: string) => emitWrite('update-list', { room, id, title, ...who() }),
    deleteList: (id: string): Promise<UndoOffer> => emitWriteAck<UndoOffer>('delete-list', { room, id }, {}),
    createItem: (listId: string, text: string) => emitWrite('create-list-item', { room, listId, text, ...who() }),
    toggleItem: (id: string, checked: boolean) => emitWrite('toggle-list-item', { room, id, checked, ...who() }),
    updateItemText: (id: string, text: string) => emitWrite('update-list-item', { room, id, text, ...who() }),
    deleteItem: (id: string): Promise<UndoOffer> => emitWriteAck<UndoOffer>('delete-list-item', { room, id, ...who() }, {}),
    clearCompleted: (listId: string): Promise<UndoOffer> => emitWriteAck<UndoOffer>('clear-completed-items', { room, listId, ...who() }, {}),
    cloneList: (id: string) => emitWrite('clone-list', { room, id, ...who() }),
  }
}
