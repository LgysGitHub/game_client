/* eslint-disable react/no-typos */
import { Object3D } from 'three'
import 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      primitive: ReactThreeFiber.Object3DNode<Object3D, typeof Object3D>;
    }
  }
}