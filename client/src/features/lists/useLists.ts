import { useEffect, useState } from 'react'
import { socket } from '../../socket'
import type { List, ListItem, UndoOffer } from '../../types'

// Estado del módulo de listas: listas y sus ítems. Refresca ambas colecciones
// desde `access-granted` (reconexión).
export function useLists(room: string, initialLists: List[], initialItems: ListItem[]) {
  const [lists, setLists] = useState<List[]>(initialLists)
  const [listItems, setListItems] = useState<ListItem[]>(initialItems)

  useEffect(() => {
    // Dedupe en las altas: `undo-delete` re-emite *-created para restaurar.
    function onListCreated(list: List) { setLists(prev => prev.some(l => l.id === list.id) ? prev : [...prev, list]) }
    function onListDeleted(id: string) { setLists(prev => prev.filter(l => l.id !== id)) }
    function onItemCreated(item: ListItem) { setListItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]) }
    function onItemUpdated(item: ListItem) { setListItems(prev => prev.map(i => i.id === item.id ? item : i)) }
    function onItemDeleted(id: string) { setListItems(prev => prev.filter(i => i.id !== id)) }
    function onGranted(payload: { lists: List[]; listItems: ListItem[] }) {
      setLists(payload.lists)
      setListItems(payload.listItems)
    }

    socket.on('list-created', onListCreated)
    socket.on('list-deleted', onListDeleted)
    socket.on('list-item-created', onItemCreated)
    socket.on('list-item-updated', onItemUpdated)
    socket.on('list-item-deleted', onItemDeleted)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('list-created', onListCreated)
      socket.off('list-deleted', onListDeleted)
      socket.off('list-item-created', onItemCreated)
      socket.off('list-item-updated', onItemUpdated)
      socket.off('list-item-deleted', onItemDeleted)
      socket.off('access-granted', onGranted)
    }
  }, [])

  return {
    lists,
    listItems,
    createList: (title: string) => socket.emit('create-list', { room, title }),
    deleteList: (id: string): Promise<UndoOffer> =>
      new Promise(resolve => {
        socket.timeout(5000).emit('delete-list', { room, id }, (_e: unknown, res: UndoOffer) => resolve(res ?? {}))
      }),
    createItem: (listId: string, text: string) => socket.emit('create-list-item', { room, listId, text }),
    toggleItem: (id: string, checked: boolean) => socket.emit('toggle-list-item', { room, id, checked }),
    deleteItem: (id: string): Promise<UndoOffer> =>
      new Promise(resolve => {
        socket.timeout(5000).emit('delete-list-item', { room, id }, (_e: unknown, res: UndoOffer) => resolve(res ?? {}))
      }),
  }
}
