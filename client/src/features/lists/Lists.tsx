import { useState, useEffect, useRef } from 'react'
import './lists.css'
import type { List, ListItem } from '../../types'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  lists: List[]
  listItems: ListItem[]
  onCreateList: (title: string) => void
  onDeleteList: (id: string) => void
  onCreateItem: (listId: string, text: string) => void
  onToggleItem: (id: string, checked: boolean) => void
  onDeleteItem: (id: string) => void
}

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

const IconChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const IconListPlaceholder = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)

export default function Lists({ lists, listItems, onCreateList, onDeleteList, onCreateItem, onToggleItem, onDeleteItem }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newListTitle, setNewListTitle] = useState('')
  const [newItemText, setNewItemText] = useState('')
  const [mobilePage, setMobilePage] = useState<'lists' | 'detail'>('lists')
  const newItemRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  // Si la lista seleccionada fue eliminada, deseleccionar
  useEffect(() => {
    if (selectedId !== null && !lists.find(l => l.id === selectedId)) {
      setSelectedId(null)
      if (isMobile) setMobilePage('lists')
    }
  }, [lists, selectedId, isMobile])

  function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    const title = newListTitle.trim()
    if (!title) return
    onCreateList(title)
    setNewListTitle('')
  }

  function handleDeleteList(id: string) {
    onDeleteList(id)
    if (isMobile) setMobilePage('lists')
  }

  function handleSelectList(id: string) {
    setSelectedId(id)
    setNewItemText('')
    if (isMobile) setMobilePage('detail')
    setTimeout(() => newItemRef.current?.focus(), 80)
  }

  function handleCreateItem(e: React.FormEvent) {
    e.preventDefault()
    const text = newItemText.trim()
    if (!text || !selectedId) return
    onCreateItem(selectedId, text)
    setNewItemText('')
    newItemRef.current?.focus()
  }

  function handleToggleItem(item: ListItem) {
    onToggleItem(item.id, !item.checked)
  }

  function handleDeleteItem(id: string) {
    onDeleteItem(id)
  }

  const selectedList = lists.find(l => l.id === selectedId) ?? null
  const allSelected = listItems.filter(i => i.list_id === selectedId)
  const unchecked = allSelected.filter(i => !i.checked)
  const checked = allSelected.filter(i => i.checked)

  // ─── Sidebar ────────────────────────────────────────────
  const sidebar = (
    <aside className="lists-sidebar">
      <div className="lists-sidebar-header">
        <span className="lists-sidebar-label">Mis listas</span>
      </div>

      <div className="lists-sidebar-scroll">
        {lists.length === 0 && (
          <p className="lists-sidebar-empty">Crea tu primera lista abajo</p>
        )}
        {lists.map(list => {
          const items = listItems.filter(i => i.list_id === list.id)
          const done = items.filter(i => i.checked).length
          const active = list.id === selectedId
          return (
            <div
              key={list.id}
              className={`lists-sidebar-item ${active ? 'lists-sidebar-item--active' : ''}`}
            >
              <button
                className="lists-sidebar-item-btn"
                onClick={() => handleSelectList(list.id)}
              >
                <span className="lists-sidebar-item-title">{list.title}</span>
                {items.length > 0 && (
                  <span className="lists-sidebar-item-count">{done}/{items.length}</span>
                )}
              </button>
              <button
                className="lists-delete-btn"
                onClick={() => handleDeleteList(list.id)}
                aria-label={`Eliminar lista ${list.title}`}
              >
                <IconTrash />
              </button>
            </div>
          )
        })}
      </div>

      <form className="lists-new-form" onSubmit={handleCreateList}>
        <input
          placeholder="Nueva lista…"
          value={newListTitle}
          onChange={e => setNewListTitle(e.target.value)}
        />
        <button className="btn-primary" type="submit">Añadir</button>
      </form>
    </aside>
  )

  // ─── Detail panel ────────────────────────────────────────
  const detail = (
    <section className="lists-detail">
      {!selectedList ? (
        <div className="lists-empty">
          <span className="lists-empty-icon"><IconListPlaceholder /></span>
          <h3>Selecciona una lista</h3>
          <p>Elige una lista de la barra lateral o crea una nueva</p>
        </div>
      ) : (
        <>
          <div className="lists-detail-header">
            {isMobile && (
              <button
                className="btn-ghost btn-icon"
                onClick={() => setMobilePage('lists')}
                aria-label="Volver a listas"
              >
                <IconChevronLeft />
              </button>
            )}
            <h2 className="lists-detail-title">{selectedList.title}</h2>
            {allSelected.length > 0 && (
              <span className="lists-detail-count">
                {checked.length}/{allSelected.length}
              </span>
            )}
            <button
              className="lists-delete-btn lists-delete-btn--visible"
              onClick={() => handleDeleteList(selectedList.id)}
              aria-label="Eliminar lista"
            >
              <IconTrash />
            </button>
          </div>

          <div className="lists-detail-scroll">
            {allSelected.length === 0 && (
              <p className="lists-detail-empty">Añade el primer ítem abajo</p>
            )}

            {unchecked.map(item => (
              <div key={item.id} className="lists-item-row">
                <button
                  className="lists-check"
                  onClick={() => handleToggleItem(item)}
                  aria-label="Marcar como completado"
                />
                <span className="lists-item-text" onClick={() => handleToggleItem(item)}>
                  {item.text}
                </span>
                <button
                  className="lists-delete-btn"
                  onClick={() => handleDeleteItem(item.id)}
                  aria-label="Eliminar ítem"
                >
                  <IconTrash />
                </button>
              </div>
            ))}

            {checked.length > 0 && (
              <>
                {unchecked.length > 0 && <div className="lists-section-divider" />}
                <p className="lists-section-label">Completados · {checked.length}</p>
                {checked.map(item => (
                  <div key={item.id} className="lists-item-row lists-item-row--checked">
                    <button
                      className="lists-check lists-check--on"
                      onClick={() => handleToggleItem(item)}
                      aria-label="Marcar como pendiente"
                    >
                      <IconCheck />
                    </button>
                    <span
                      className="lists-item-text lists-item-text--done"
                      onClick={() => handleToggleItem(item)}
                    >
                      {item.text}
                    </span>
                    <button
                      className="lists-delete-btn"
                      onClick={() => handleDeleteItem(item.id)}
                      aria-label="Eliminar ítem"
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          <form className="lists-new-item-form" onSubmit={handleCreateItem}>
            <input
              ref={newItemRef}
              placeholder="Añadir ítem…"
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
            />
            <button className="btn-primary" type="submit">Añadir</button>
          </form>
        </>
      )}
    </section>
  )

  if (isMobile) {
    return (
      <div className="lists-container">
        {mobilePage === 'lists' ? sidebar : detail}
      </div>
    )
  }

  return (
    <div className="lists-container">
      {sidebar}
      {detail}
    </div>
  )
}
