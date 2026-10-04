import { useState, useEffect, useRef } from 'react'
import './lists.css'
import type { List, ListItem } from '../../types'
import { useIsMobile } from '../../hooks/useIsMobile'
import { readableTextColor } from '../../shared/color'
import { listActivityText } from './listActivity'

interface Props {
  lists: List[]
  listItems: ListItem[]
  onCreateList: (title: string) => void
  onUpdateListTitle: (id: string, title: string) => void
  onDeleteList: (id: string) => void
  onCloneList: (id: string) => void
  onCreateItem: (listId: string, text: string) => void
  onToggleItem: (id: string, checked: boolean) => void
  onUpdateItemText: (id: string, text: string) => void
  onDeleteItem: (id: string) => void
  onClearCompleted: (listId: string) => void
  // Abrir una lista desde fuera (búsqueda global); `onFocusHandled` limpia el
  // "pedido" en el padre para no reabrirla en cada re-render.
  focusListId?: string | null
  onFocusHandled?: () => void
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

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
  </svg>
)

const IconChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
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

// Anillo de progreso (relleno = completado). Un SVG simple en vez de texto
// plano "N/M".
function ProgressRing({ done, total, color }: { done: number; total: number; color: string }) {
  const r = 8
  const c = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="lists-progress-ring" aria-hidden="true">
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
      <circle
        cx="10" cy="10" r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round" transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

interface ItemRowProps {
  item: ListItem
  editing: boolean
  editText: string
  onStartEdit: () => void
  onEditTextChange: (v: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onToggle: () => void
  onDelete: () => void
}

// Fila de ítem: toque en el texto = marcar/desmarcar (como siempre); el lápiz
// la cambia a modo edición (un <input> sustituye al <span> — Enter/perder el
// foco guarda, Escape descarta). El check tiene un pequeño "pop" al marcarse
// (ver .lists-check--on en lists.css). Editar/eliminar están siempre
// visibles (no solo al hover: en táctil no hay hover y quedaban invisibles).
function ItemRow({ item, editing, editText, onStartEdit, onEditTextChange, onCommitEdit, onCancelEdit, onToggle, onDelete }: ItemRowProps) {
  return (
    <div className={`lists-item-row${item.checked ? ' lists-item-row--checked' : ''}`}>
      <button
        className={`lists-check${item.checked ? ' lists-check--on' : ''}`}
        onClick={onToggle}
        aria-label={item.checked ? 'Marcar como pendiente' : 'Marcar como completado'}
      >
        {item.checked && <IconCheck />}
      </button>
      {editing ? (
        <input
          className="lists-item-edit-input"
          value={editText}
          autoFocus
          onChange={e => onEditTextChange(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onCommitEdit() }
            else if (e.key === 'Escape') onCancelEdit()
          }}
        />
      ) : (
        <>
          <span
            className={`lists-item-text${item.checked ? ' lists-item-text--done' : ''}`}
            onClick={onToggle}
          >
            {item.text}
          </span>
          <button className="lists-edit-btn" onClick={onStartEdit} aria-label="Editar ítem">
            <IconEdit />
          </button>
          <button className="lists-delete-btn" onClick={onDelete} aria-label="Eliminar ítem">
            <IconTrash />
          </button>
        </>
      )}
    </div>
  )
}

export default function Lists({
  lists, listItems, onCreateList, onUpdateListTitle, onDeleteList, onCloneList,
  onCreateItem, onToggleItem, onUpdateItemText, onDeleteItem, onClearCompleted,
  focusListId, onFocusHandled,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newListTitle, setNewListTitle] = useState('')
  const [newItemText, setNewItemText] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [mobilePage, setMobilePage] = useState<'lists' | 'detail'>('lists')
  // Para la celebración al completar: recuerda si cada lista estaba "ya
  // completa" la última vez que se evaluó, de forma que solo se celebre la
  // transición pendiente→completa (no al re-abrir una lista que ya estaba
  // completa de antes). Se actualiza durante el render, no en un efecto —
  // es el patrón que React recomienda para "ajustar estado derivado de
  // props/estado que cambia" sin pasar por useEffect.
  const [prevDone, setPrevDone] = useState<Record<string, boolean>>({})
  const [celebrateListId, setCelebrateListId] = useState<string | null>(null)
  const newItemRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  // Si la lista seleccionada fue eliminada, deseleccionar
  useEffect(() => {
    if (selectedId !== null && !lists.find(l => l.id === selectedId)) {
      setSelectedId(null)
      if (isMobile) setMobilePage('lists')
    }
  }, [lists, selectedId, isMobile])

  // Auto-descarta el aviso de "completada" a los 2.2s.
  useEffect(() => {
    if (!celebrateListId) return
    const t = setTimeout(() => setCelebrateListId(null), 2200)
    return () => clearTimeout(t)
  }, [celebrateListId])

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
    setTitleDraft(lists.find(l => l.id === id)?.title ?? '')
    setNewItemText('')
    setEditingItemId(null)
    if (isMobile) setMobilePage('detail')
    setTimeout(() => newItemRef.current?.focus(), 80)
  }

  // Resultado de la búsqueda global: abre la lista como si se hubiera
  // tocado en la barra lateral. Se aplica durante el render (mismo patrón
  // que prevDone/celebrateListId) en vez de en un efecto puro de
  // "sincronizar estado con una prop" — un efecto separado solo avisa al
  // padre que ya se consumió el pedido.
  const [appliedFocusListId, setAppliedFocusListId] = useState<string | null>(null)
  if (focusListId && focusListId !== appliedFocusListId) {
    setAppliedFocusListId(focusListId)
    // Inline en vez de handleSelectList: esa función toca newItemRef (para
    // enfocar el campo de nuevo ítem), y una llamada que accede a un ref no
    // puede hacerse desde el cuerpo del render.
    if (focusListId !== selectedId) {
      setSelectedId(focusListId)
      setTitleDraft(lists.find(l => l.id === focusListId)?.title ?? '')
      setNewItemText('')
      setEditingItemId(null)
      if (isMobile) setMobilePage('detail')
    }
  }

  useEffect(() => {
    if (focusListId) onFocusHandled?.()
  }, [focusListId]) // eslint-disable-line react-hooks/exhaustive-deps

  function commitTitle() {
    if (!selectedList) return
    const t = titleDraft.trim()
    if (t && t !== selectedList.title) onUpdateListTitle(selectedList.id, t)
    else setTitleDraft(selectedList.title)
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

  function startEditItem(item: ListItem) {
    setEditingItemId(item.id)
    setEditingText(item.text)
  }

  function commitEditItem() {
    if (!editingItemId) return
    const original = listItems.find(i => i.id === editingItemId)
    const t = editingText.trim()
    if (original && t && t !== original.text) onUpdateItemText(editingItemId, t)
    setEditingItemId(null)
  }

  function cancelEditItem() {
    setEditingItemId(null)
  }

  function handleCloneList(id: string) {
    onCloneList(id)
  }

  const selectedList = lists.find(l => l.id === selectedId) ?? null
  const allSelected = listItems.filter(i => i.list_id === selectedId)
  const unchecked = allSelected.filter(i => !i.checked)
  const checked = allSelected.filter(i => i.checked)

  // Detecta la transición pendiente→completa de la lista abierta (ver nota
  // sobre `prevDone` arriba).
  const isDone = !!selectedList && allSelected.length > 0 && unchecked.length === 0
  if (selectedList && prevDone[selectedList.id] !== isDone) {
    const id = selectedList.id
    const wasPending = prevDone[id] === false
    setPrevDone(prev => ({ ...prev, [id]: isDone }))
    if (isDone && wasPending) setCelebrateListId(id)
  }

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
                  <span className="lists-sidebar-item-count">
                    <ProgressRing done={done} total={items.length} color="var(--primary)" />
                    {done}/{items.length}
                  </span>
                )}
              </button>
              <button
                className="lists-clone-btn"
                onClick={() => handleCloneList(list.id)}
                aria-label={`Clonar lista ${list.title}`}
              >
                <IconCopy />
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
            <input
              className="lists-detail-title-input"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              aria-label="Nombre de la lista"
            />
            {allSelected.length > 0 && (
              <span className="lists-detail-progress">
                <ProgressRing done={checked.length} total={allSelected.length} color="var(--primary)" />
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

          <p className={`lists-detail-activity${selectedList.edited_at ? '' : ' lists-detail-activity--empty'}`}>
            {selectedList.edited_at && selectedList.last_editor_name && (
              <span
                className="lists-detail-activity-avatar"
                style={selectedList.last_editor_color ? { background: selectedList.last_editor_color, color: readableTextColor(selectedList.last_editor_color) } : undefined}
                aria-hidden="true"
              >
                {selectedList.last_editor_name.charAt(0)}
              </span>
            )}
            <span>{listActivityText(selectedList)}</span>
          </p>

          {celebrateListId === selectedList.id && (
            <p className="lists-celebrate" role="status">🎉 ¡Lista completada!</p>
          )}

          <div className="lists-detail-scroll">
            {allSelected.length === 0 && (
              <p className="lists-detail-empty">Añade el primer ítem abajo</p>
            )}

            {unchecked.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                editing={editingItemId === item.id}
                editText={editingText}
                onStartEdit={() => startEditItem(item)}
                onEditTextChange={setEditingText}
                onCommitEdit={commitEditItem}
                onCancelEdit={cancelEditItem}
                onToggle={() => handleToggleItem(item)}
                onDelete={() => handleDeleteItem(item.id)}
              />
            ))}

            {checked.length > 0 && (
              <>
                {unchecked.length > 0 && <div className="lists-section-divider" />}
                <div className="lists-section-header">
                  <p className="lists-section-label">Completados · {checked.length}</p>
                  <button
                    type="button"
                    className="lists-clear-btn"
                    onClick={() => onClearCompleted(selectedList.id)}
                  >
                    Vaciar
                  </button>
                </div>
                {checked.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    editing={editingItemId === item.id}
                    editText={editingText}
                    onStartEdit={() => startEditItem(item)}
                    onEditTextChange={setEditingText}
                    onCommitEdit={commitEditItem}
                    onCancelEdit={cancelEditItem}
                    onToggle={() => handleToggleItem(item)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
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
