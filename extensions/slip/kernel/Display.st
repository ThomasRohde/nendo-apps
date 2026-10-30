"Slip kernel: geometry, colour, the Canvas a morph draws on, and the events the display hands the World."!

Point comment: 'An x and a y, for a place on the display or a size. Make one with 3 @ 4.'!
Rect comment: 'A rectangle from its origin (top left) to its corner (bottom right), corner excluded. Make one with 0 @ 0 extent: 100 @ 40.'!
Color comment: 'A colour: red, green and blue from 0 to 255, and alpha from 0 to 1. Color text, Color background and the others on the class side follow the display''s light or dark theme.'!
Canvas comment: 'What a morph draws on. Each message adds one drawing operation; the display paints them all once the World has drawn, so a frame never shows half drawn.'!
UIEvent comment: 'An event the display hands the World: #mouseDown, #mouseMove, #mouseUp, #keyDown, #step, #resize or #redraw, with a position and, for a key, its name (''a'', ''Enter'', ''Backspace'').'!

!Point class methodsFor: 'instance creation'!
x: xNumber y: yNumber
	^self basicNew setX: xNumber y: yNumber
! !

!Point methodsFor: 'accessing'!
x
	^x
!
y
	^y
!
setX: xNumber y: yNumber
	x := xNumber.
	y := yNumber
! !

!Point methodsFor: 'arithmetic'!
+ arg
	| p |
	p := arg asPoint.
	^(x + p x) @ (y + p y)
!
- arg
	| p |
	p := arg asPoint.
	^(x - p x) @ (y - p y)
!
* arg
	| p |
	p := arg asPoint.
	^(x * p x) @ (y * p y)
!
/ arg
	| p |
	p := arg asPoint.
	^(x / p x) @ (y / p y)
!
// arg
	| p |
	p := arg asPoint.
	^(x // p x) @ (y // p y)
!
abs
	^x abs @ y abs
!
negated
	^x negated @ y negated
!
rounded
	^x rounded @ y rounded
!
truncated
	^x truncated @ y truncated
!
dist: aPoint
	^((x - aPoint x) squared + (y - aPoint y) squared) sqrt
!
max: aPoint
	^(x max: aPoint x) @ (y max: aPoint y)
!
min: aPoint
	^(x min: aPoint x) @ (y min: aPoint y)
! !

!Point methodsFor: 'comparing'!
= aPoint
	^(aPoint isKindOf: Point) and: [x = aPoint x and: [y = aPoint y]]
!
hash
	^x hash bitXor: y hash * 31
!
< aPoint
	^x < aPoint x and: [y < aPoint y]
!
> aPoint
	^x > aPoint x and: [y > aPoint y]
!
<= aPoint
	^x <= aPoint x and: [y <= aPoint y]
!
>= aPoint
	^x >= aPoint x and: [y >= aPoint y]
! !

!Point methodsFor: 'converting'!
asPoint
	^self
!
corner: aPoint
	^Rect origin: self corner: aPoint
!
extent: aPoint
	^Rect origin: self extent: aPoint
! !

!Point methodsFor: 'printing'!
printOn: aStream
	x printOn: aStream.
	aStream nextPut: $@.
	y printOn: aStream
! !

!Number methodsFor: 'converting'!
@ aNumber
	^Point x: self y: aNumber
!
asPoint
	^Point x: self y: self
! !

!Rect class methodsFor: 'instance creation'!
origin: originPoint corner: cornerPoint
	^self basicNew setOrigin: originPoint corner: cornerPoint
!
origin: originPoint extent: extentPoint
	^self origin: originPoint corner: originPoint + extentPoint
!
left: left right: right top: top bottom: bottom
	^self origin: left @ top corner: right @ bottom
! !

!Rect methodsFor: 'accessing'!
setOrigin: originPoint corner: cornerPoint
	origin := originPoint.
	corner := cornerPoint
!
origin
	^origin
!
corner
	^corner
!
left
	^origin x
!
top
	^origin y
!
right
	^corner x
!
bottom
	^corner y
!
width
	^corner x - origin x
!
height
	^corner y - origin y
!
extent
	^corner - origin
!
center
	^(origin + corner) // 2
!
topLeft
	^origin
!
topRight
	^corner x @ origin y
!
bottomLeft
	^origin x @ corner y
!
bottomRight
	^corner
! !

!Rect methodsFor: 'testing'!
containsPoint: aPoint
	^aPoint x >= origin x and: [aPoint x < corner x and: [aPoint y >= origin y and: [aPoint y < corner y]]]
!
intersects: aRect
	^origin x < aRect right and: [aRect left < corner x and: [origin y < aRect bottom and: [aRect top < corner y]]]
! !

!Rect methodsFor: 'comparing'!
= aRect
	^(aRect isKindOf: Rect) and: [origin = aRect origin and: [corner = aRect corner]]
!
hash
	^origin hash bitXor: corner hash * 31
! !

!Rect methodsFor: 'transforming'!
translateBy: delta
	^Rect origin: origin + delta corner: corner + delta
!
insetBy: delta
	^Rect origin: origin + delta corner: corner - delta
!
expandBy: delta
	^Rect origin: origin - delta corner: corner + delta
!
moveTo: aPoint
	^Rect origin: aPoint extent: self extent
! !

!Rect methodsFor: 'printing'!
printOn: aStream
	origin printOn: aStream.
	aStream nextPutAll: ' corner: '.
	corner printOn: aStream
! !

!Color class methodsFor: 'instance creation'!
r: red g: green b: blue
	^self r: red g: green b: blue alpha: 1
!
r: red g: green b: blue alpha: alpha
	^self basicNew setRed: red green: green blue: blue alpha: alpha
! !

!Color class methodsFor: 'named colours'!
black
	^self r: 0 g: 0 b: 0
!
white
	^self r: 255 g: 255 b: 255
!
gray
	^self r: 128 g: 128 b: 128
!
red
	^self r: 220 g: 38 b: 38
!
green
	^self r: 22 g: 163 b: 74
!
blue
	^self r: 37 g: 99 b: 235
!
yellow
	^self r: 234 g: 179 b: 8
!
orange
	^self r: 234 g: 88 b: 12
!
transparent
	^self r: 0 g: 0 b: 0 alpha: 0
! !

!Color class methodsFor: 'theme'!
isDark
	"Whether the display shows the dark theme."
	<primitive: 'displayDark'>
	^false
!
theme: aSymbol ifNone: aBlock
	"The colour of the display's theme named aSymbol: Nendo's own token, as the view shows it."
	<primitive: 'themeColor'>
	^aBlock value
!
background
	^self theme: #background ifNone: [self isDark ifTrue: [self r: 39 g: 40 b: 41] ifFalse: [self r: 249 g: 249 b: 250]]
!
panel
	^self theme: #panel ifNone: [self isDark ifTrue: [self r: 56 g: 57 b: 59] ifFalse: [self r: 243 g: 243 b: 244]]
!
surface
	^self theme: #surface ifNone: [self isDark ifTrue: [self r: 50 g: 51 b: 53] ifFalse: [self white]]
!
text
	^self theme: #text ifNone: [self isDark ifTrue: [self white] ifFalse: [self r: 27 g: 27 b: 27]]
!
mutedText
	^self theme: #mutedText ifNone: [self isDark ifTrue: [self r: 197 g: 197 b: 197] ifFalse: [self r: 93 g: 93 b: 93]]
!
accent
	^self theme: #accent ifNone: [self isDark ifTrue: [self r: 96 g: 205 b: 255] ifFalse: [self r: 0 g: 95 b: 184]]
!
onAccent
	"Text on the accent colour."
	^self isDark ifTrue: [self black] ifFalse: [self white]
!
line
	^self theme: #line ifNone: [self isDark ifTrue: [self r: 75 g: 76 b: 79] ifFalse: [self r: 209 g: 209 b: 209]]
! !

!Color methodsFor: 'accessing'!
setRed: r green: g blue: b alpha: a
	red := r.
	green := g.
	blue := b.
	alpha := a
!
red
	^red
!
green
	^green
!
blue
	^blue
!
alpha
	^alpha
!
alpha: aNumber
	^Color r: red g: green b: blue alpha: aNumber
! !

!Color methodsFor: 'mixing'!
mixed: proportion with: aColor
	^Color
		r: (red + (aColor red - red * proportion)) rounded
		g: (green + (aColor green - green * proportion)) rounded
		b: (blue + (aColor blue - blue * proportion)) rounded
		alpha: alpha
!
lighter
	^self mixed: 1 / 4 with: Color white
!
darker
	^self mixed: 1 / 4 with: Color black
! !

!Color methodsFor: 'comparing'!
= aColor
	^(aColor isKindOf: Color) and: [red = aColor red and: [green = aColor green and: [blue = aColor blue and: [alpha = aColor alpha]]]]
!
hash
	^(red * 65536 + (green * 256) + blue) hash
! !

!Color methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: '(Color r: '; print: red; nextPutAll: ' g: '; print: green; nextPutAll: ' b: '; print: blue.
	alpha = 1 ifFalse: [aStream nextPutAll: ' alpha: '; print: alpha].
	aStream nextPut: $)
! !

!Canvas methodsFor: 'drawing'!
fillRect: aRect color: aColor
	<primitive: 'canvasFillRect'>
	^self error: 'fillRect:color: takes a Rect and a Color.'
!
frameRect: aRect color: aColor
	^self frameRect: aRect color: aColor width: 1
!
frameRect: aRect color: aColor width: aNumber
	<primitive: 'canvasFrameRect'>
	^self error: 'frameRect:color:width: takes a Rect, a Color and a width from 0 to 1000.'
!
fillRoundRect: aRect radius: aNumber color: aColor
	<primitive: 'canvasRoundRect'>
	^self error: 'fillRoundRect:radius:color: takes a Rect, a radius from 0 to 1000 and a Color.'
!
fillOval: aRect color: aColor
	<primitive: 'canvasOval'>
	^self error: 'fillOval:color: takes a Rect and a Color.'
!
line: fromPoint to: toPoint color: aColor width: aNumber
	<primitive: 'canvasLine'>
	^self error: 'line:to:color:width: takes two Points, a Color and a width from 0 to 1000.'
!
drawString: aString at: aPoint color: aColor
	^self drawString: aString at: aPoint size: 14 bold: false color: aColor
!
drawString: aString at: aPoint size: aNumber bold: aBoolean color: aColor
	"aPoint is the top left of the text."
	<primitive: 'canvasText'>
	^self error: 'drawString:at:size:bold:color: takes a String, a Point, a size from 1 to 1000, a Boolean and a Color.'
!
clipTo: aRect during: aBlock
	"Draws only inside aRect while aBlock runs."
	self pushClip: aRect.
	^aBlock ensure: [self popClip]
!
pushClip: aRect
	<primitive: 'canvasPushClip'>
	^self error: 'pushClip: takes a Rect.'
!
popClip
	<primitive: 'canvasPopClip'>
	^self error: 'popClip failed.'
! !

!Canvas class methodsFor: 'measuring'!
widthOf: aString size: aNumber
	^self widthOf: aString size: aNumber bold: false
!
widthOf: aString size: aNumber bold: aBoolean
	"The width aString takes on the display, in pixels."
	<primitive: 'textWidth'>
	^self error: 'widthOf:size:bold: takes a String, a size from 1 to 1000 and a Boolean.'
! !

!UIEvent class methodsFor: 'instance creation'!
type: aSymbol position: aPoint
	^self type: aSymbol position: aPoint button: 0 key: nil shift: false
!
type: aSymbol position: aPoint button: anInteger key: aString shift: aBoolean
	^self basicNew setType: aSymbol position: aPoint button: anInteger key: aString shift: aBoolean
! !

!UIEvent methodsFor: 'accessing'!
setType: aSymbol position: aPoint button: anInteger key: aString shift: aBoolean
	type := aSymbol.
	position := aPoint.
	button := anInteger.
	key := aString.
	shift := aBoolean
!
type
	^type
!
position
	^position
!
button
	^button
!
key
	"The key's name: the character typed ('a', 'A', ' '), or 'Enter', 'Backspace', 'Escape', 'Tab', 'ArrowLeft' and the like."
	^key
!
shift
	^shift
!
keyCharacter
	^(key notNil and: [key size = 1]) ifTrue: [key first] ifFalse: [nil]
! !

!UIEvent methodsFor: 'testing'!
isMouseDown
	^type == #mouseDown
!
isMouseUp
	^type == #mouseUp
!
isMouseMove
	^type == #mouseMove
!
isKeyDown
	^type == #keyDown
! !

!UIEvent methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'a UIEvent('; nextPutAll: type; nextPutAll: ' at '; print: position.
	key ifNotNil: [:k | aStream nextPutAll: ' key '; print: k].
	aStream nextPut: $)
! !
