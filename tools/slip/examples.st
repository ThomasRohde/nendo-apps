"The example code Slip.nendo carries: three small classes and one method added to a kernel class. Build-Slip.mjs files it into an image and keeps what it made as records."!

Object subclass: #Stack
	instanceVariableNames: 'items'
	classVariableNames: ''
	package: 'Examples'!

Object subclass: #Shape
	instanceVariableNames: 'name'
	classVariableNames: ''
	package: 'Examples'!

Shape subclass: #Circle
	instanceVariableNames: 'radius'
	classVariableNames: ''
	package: 'Examples'!

Shape subclass: #Rectangle
	instanceVariableNames: 'width height'
	classVariableNames: ''
	package: 'Examples'!

Stack comment: 'A last-in, first-out stack over an OrderedCollection. Try: Stack new push: 1; push: 2; pop'!
Shape comment: 'A shape with an area. Its subclasses say how to work the area out.'!

!Stack methodsFor: 'initialization'!
initialize
	items := OrderedCollection new
! !

!Stack methodsFor: 'operations'!
push: anObject
	^items addLast: anObject
!
pop
	items isEmpty ifTrue: [^self error: 'The stack is empty.'].
	^items removeLast
!
top
	^items last
! !

!Stack methodsFor: 'testing'!
isEmpty
	^items isEmpty
!
size
	^items size
! !

!Stack methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'a Stack'.
	items asArray printOn: aStream
! !

!Stack class methodsFor: 'instance creation'!
new
	^super new initialize
! !

!Shape methodsFor: 'measuring'!
area
	^self subclassResponsibility
! !

!Shape methodsFor: 'comparing'!
< aShape
	^self area < aShape area
!
<= aShape
	^self area <= aShape area
! !

!Shape methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: self class name; nextPutAll: ' of area '; print: self area
! !

!Circle methodsFor: 'accessing'!
radius: aNumber
	radius := aNumber
! !

!Circle methodsFor: 'measuring'!
area
	^radius * radius * Float pi
! !

!Circle class methodsFor: 'instance creation'!
radius: aNumber
	^self new radius: aNumber
! !

!Rectangle methodsFor: 'accessing'!
width: w height: h
	width := w.
	height := h
! !

!Rectangle methodsFor: 'measuring'!
area
	^width * height
! !

!Rectangle class methodsFor: 'instance creation'!
width: w height: h
	^self new width: w height: h
! !

!Integer methodsFor: '*Examples'!
isPerfect
	"A perfect number is the sum of its proper divisors: 6 = 1 + 2 + 3."
	^self > 1 and: [(((1 to: self - 1) select: [:d | self \\ d = 0]) inject: 0 into: [:a :b | a + b]) = self]
! !
