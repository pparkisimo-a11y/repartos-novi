'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { AppUser } from '@/lib/types'

type Handler = (payload: unknown) => void

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * Connects to the realtime service and joins the room matching the user's role.
 * - driver     → room 'driver'
 * - restaurant → room 'restaurant:<id>'
 *
 * Two connection modes:
 * - PRODUCTION (NEXT_PUBLIC_SOCKET_SAME_ORIGIN=true, set on Render): socket.io is
 *   served by the app itself (server.js) on the same origin, default path /socket.io.
 * - SANDBOX (dev): connect through the Caddy gateway using XTransformPort=3003
 *   to reach the realtime mini-service.
 *
 * The socket instance is kept in a ref (never read during render). Components
 * subscribe to events via the returned stable `subscribe` function.
 */
export function useSocket(user: AppUser | null) {
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const socketRef = useRef<Socket | null>(null)
  // handlers registered before the socket is ready, so we can attach on connect
  const pendingRef = useRef<Map<string, Set<Handler>>>(new Map())

  useEffect(() => {
    if (!user) return

    const sameOrigin = process.env.NEXT_PUBLIC_SOCKET_SAME_ORIGIN === 'true'
    const commonOpts = {
      transports: ['websocket', 'polling'] as const,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    }
    const instance = sameOrigin
      ? io(commonOpts) // same origin, path /socket.io (custom server)
      : io('/?XTransformPort=3003', commonOpts) // sandbox gateway → mini-service
    socketRef.current = instance

    // attach any handlers registered before the socket existed
    pendingRef.current.forEach((set, event) => {
      set.forEach((h) => instance.on(event, h))
    })

    const onConnect = () => {
      setIsConnected(true)
      setStatus('connected')
      if (user.role === 'driver') {
        instance.emit('join', { role: 'driver', driverId: user.id })
      } else if (user.role === 'admin') {
        instance.emit('join', { role: 'admin', adminId: user.id })
      } else {
        instance.emit('join', { role: 'restaurant', restaurantId: user.id })
      }
    }
    const onDisconnect = () => {
      setIsConnected(false)
      setStatus('disconnected')
    }

    instance.on('connect', onConnect)
    instance.on('reconnect', onConnect)
    instance.on('disconnect', onDisconnect)

    return () => {
      instance.off('connect', onConnect)
      instance.off('reconnect', onConnect)
      instance.off('disconnect', onDisconnect)
      instance.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setStatus('disconnected')
    }
  }, [user])

  /**
   * Subscribe to a realtime event. Returns an unsubscribe function.
   * Safe to call in an effect with a stable dependency.
   */
  const subscribe = useCallback(
    (event: string, handler: Handler) => {
      let set = pendingRef.current.get(event)
      if (!set) {
        set = new Set()
        pendingRef.current.set(event, set)
      }
      set.add(handler)
      const socket = socketRef.current
      if (socket) socket.on(event, handler)
      return () => {
        set!.delete(handler)
        socketRef.current?.off(event, handler)
      }
    },
    [],
  )

  return { isConnected, status, subscribe }
}
