"Slip kernel: morphs, the objects the World shows. A morph has bounds, a colour, an owner and submorphs; it draws itself on a Canvas and takes the events the World hands it. World is the one WorldMorph: World open: aMorph shows a morph in Slip's World tab."!

Morph comment: 'An object the World shows. Its colour is a Color, or a Symbol that names a colour of the theme (#accent, #text, #surface), which then follows the theme. Override drawOn: to draw it, extentChanged to lay out its submorphs, and handlesMouseDown:, mouseDown:, mouseUp:, keyStroke:, isDraggable, wantsDroppedMorph: or step to make it do something.'!
StringMorph comment: 'A line of text. StringMorph contents: ''Hello''.'!
ButtonMorph comment: 'A button that evaluates its action when it is clicked. ButtonMorph label: ''Add'' action: [Transcript show: ''added''; cr].'!
TextFieldMorph comment: 'One line of text to type in. On Enter it evaluates its action with the text, then empties itself.'!
WorldMorph comment: 'The World: the morph the display shows, and the one the display hands its events. It gives the keyboard to the morph clicked, lets a morph be dragged and dropped, and steps the morphs that want it.'!

!Morph methodsFor: 'initialization'!
initialize
	bounds := 0 @ 0 extent: self defaultExtent.
	color := self defaultColor.
	submorphs := OrderedCollection new
!
defaultExtent
	^100 @ 40
!
defaultColor
	"A Symbol names a colour of the theme (Color perform: it), so the morph follows the theme."
	^#accent
! !

!Morph methodsFor: 'geometry'!
bounds
	^bounds
!
bounds: aRect
	self position: aRect origin.
	self extent: aRect extent
!
position
	^bounds origin
!
position: aPoint
	self moveBy: aPoint - bounds origin
!
moveBy: delta
	(delta x = 0 and: [delta y = 0]) ifTrue: [^self].
	self changed.
	bounds := bounds translateBy: delta.
	submorphs do: [:each | each moveBy: delta].
	self changed
!
extent
	^bounds extent
!
extent: aPoint
	bounds extent = aPoint ifTrue: [^self].
	bounds := bounds origin extent: aPoint.
	self changed.
	self extentChanged
!
extentChanged
	"Lays out the submorphs once the extent changed. A subclass with submorphs overrides it."
!
width
	^bounds width
!
height
	^bounds height
!
left
	^bounds left
!
top
	^bounds top
!
right
	^bounds right
!
bottom
	^bounds bottom
!
center
	^bounds center
!
containsPoint: aPoint
	^bounds containsPoint: aPoint
! !

!Morph methodsFor: 'accessing'!
color
	^color
!
drawColor
	"The colour to draw with: color, or the theme's colour that color names."
	^color isSymbol ifTrue: [Color perform: color] ifFalse: [color]
!
color: aColor
	color := aColor.
	self changed
!
owner
	^owner
!
setOwner: aMorph
	owner := aMorph
!
submorphs
	^submorphs
!
world
	^owner ifNotNil: [:o | o world]
!
hasFocus
	| world |
	world := self world.
	^world notNil and: [world focus == self]
! !

!Morph methodsFor: 'submorphs'!
addMorph: aMorph
	^self addMorph: aMorph at: submorphs size + 1
!
addMorph: aMorph at: anIndex
	"Adds aMorph at anIndex among the submorphs; a later one is drawn over an earlier one."
	aMorph owner ifNotNil: [:o | o removeMorph: aMorph].
	submorphs add: aMorph beforeIndex: ((anIndex max: 1) min: submorphs size + 1).
	aMorph setOwner: self.
	aMorph changed.
	^aMorph
!
removeMorph: aMorph
	(submorphs includes: aMorph) ifFalse: [^nil].
	aMorph changed.
	submorphs remove: aMorph.
	aMorph setOwner: nil.
	^aMorph
!
removeAllMorphs
	submorphs copy do: [:each | self removeMorph: each]
!
delete
	owner ifNotNil: [:o | o removeMorph: self]
!
allMorphsDo: aBlock
	aBlock value: self.
	submorphs copy do: [:each | each allMorphsDo: aBlock]
! !

!Morph methodsFor: 'drawing'!
changed
	"Asks the World to draw again once the event it handles is over."
	| world |
	world := self world.
	world ifNotNil: [world setNeedsRedraw]
!
drawOn: aCanvas
	aCanvas fillRect: bounds color: self drawColor
!
fullDrawOn: aCanvas
	self drawOn: aCanvas.
	submorphs do: [:each | each fullDrawOn: aCanvas]
! !

!Morph methodsFor: 'events'!
morphAt: aPoint
	^self morphAt: aPoint except: nil
!
morphAt: aPoint except: aMorph
	"The top morph at aPoint in this one, leaving aMorph and its submorphs out."
	self == aMorph ifTrue: [^nil].
	(self containsPoint: aPoint) ifFalse: [^nil].
	submorphs reverseDo: [:each | (each morphAt: aPoint except: aMorph) ifNotNil: [:found | ^found]].
	^self
!
handlesMouseDown: anEvent
	^false
!
mouseDown: anEvent
!
mouseMove: anEvent
!
mouseUp: anEvent
!
wantsKeyboardFocus
	^false
!
keyStroke: anEvent
!
handlesWheel: anEvent
	^false
!
wheel: anEvent
!
isDraggable
	^false
!
wantsDroppedMorph: aMorph
	^false
!
acceptDroppedMorph: aMorph event: anEvent
	self addMorph: aMorph
!
worldResized: aRect
	"A morph that fills the World follows its size here."
! !

!Morph methodsFor: 'stepping'!
wantsSteps
	^false
!
step
	"Called a few times a second while wantsSteps answers true."
! !

!Morph methodsFor: 'opening'!
openInWorld
	^World open: self
! !

!Morph methodsFor: 'printing'!
printOn: aStream
	super printOn: aStream.
	aStream nextPut: $(; print: bounds; nextPut: $)
! !

!StringMorph class methodsFor: 'instance creation'!
contents: aString
	^self new contents: aString
!
contents: aString size: aNumber bold: aBoolean
	^self new setContents: aString size: aNumber bold: aBoolean
! !

!StringMorph methodsFor: 'accessing'!
initialize
	super initialize.
	self setContents: '' size: 14 bold: false
!
defaultColor
	^#text
!
setContents: aString size: aNumber bold: aBoolean
	contents := aString isString ifTrue: [aString] ifFalse: [aString printString].
	size := aNumber.
	bold := aBoolean.
	self fit
!
contents
	^contents
!
contents: aString
	self setContents: aString size: size bold: bold
!
size: aNumber
	self setContents: contents size: aNumber bold: bold
!
bold: aBoolean
	self setContents: contents size: size bold: aBoolean
!
fit
	self changed.
	self extent: (Canvas widthOf: contents size: size bold: bold) @ (size * 13 // 10 + 1).
	self changed
! !

!StringMorph methodsFor: 'drawing'!
drawOn: aCanvas
	aCanvas drawString: contents at: bounds origin size: size bold: bold color: self drawColor
! !

!ButtonMorph class methodsFor: 'instance creation'!
label: aString action: aBlock
	^self new label: aString; action: aBlock; yourself
! !

!ButtonMorph methodsFor: 'accessing'!
initialize
	super initialize.
	self label: 'Button'
!
label
	^label
!
label: aString
	label := aString.
	self extent: ((Canvas widthOf: label size: 14 bold: true) + 24) @ 32.
	self changed
!
action: aBlock
	"aBlock is evaluated on a click, with the button if it takes an argument."
	action := aBlock
!
fire
	^action ifNotNil: [:block | block cull: self]
! !

!ButtonMorph methodsFor: 'events'!
handlesMouseDown: anEvent
	^true
!
mouseUp: anEvent
	(self containsPoint: anEvent position) ifTrue: [self fire]
! !

!ButtonMorph methodsFor: 'drawing'!
drawOn: aCanvas
	| width |
	width := Canvas widthOf: label size: 14 bold: true.
	aCanvas fillRoundRect: bounds radius: 6 color: self drawColor.
	aCanvas drawString: label at: (self center x - (width // 2)) @ (self center y - 9) size: 14 bold: true color: Color onAccent
! !

!TextFieldMorph methodsFor: 'accessing'!
initialize
	super initialize.
	contents := ''.
	placeholder := ''.
	self extent: 220 @ 32
!
defaultColor
	^#surface
!
contents
	^contents
!
contents: aString
	contents := aString.
	self changed
!
placeholder: aString
	placeholder := aString.
	self changed
!
action: aBlock
	"aBlock is evaluated with the text on Enter."
	action := aBlock
!
accept
	| text |
	text := contents trimmed.
	text isEmpty ifTrue: [^self].
	self contents: ''.
	action ifNotNil: [:block | block value: text]
! !

!TextFieldMorph methodsFor: 'events'!
handlesMouseDown: anEvent
	^true
!
wantsKeyboardFocus
	^true
!
keyStroke: anEvent
	| key |
	key := anEvent key.
	key = 'Enter' ifTrue: [^self accept].
	key = 'Backspace' ifTrue: [contents isEmpty ifFalse: [self contents: contents allButLast]. ^self].
	key = 'Escape' ifTrue: [^self contents: ''].
	(key notNil and: [key size = 1]) ifTrue: [self contents: contents , key]
! !

!TextFieldMorph methodsFor: 'drawing'!
drawOn: aCanvas
	| empty |
	empty := contents isEmpty.
	aCanvas fillRoundRect: bounds radius: 6 color: Color surface.
	aCanvas frameRect: bounds color: (self hasFocus ifTrue: [Color accent] ifFalse: [Color line]) width: 1.
	aCanvas clipTo: (bounds insetBy: 2) during: [
		aCanvas drawString: (empty ifTrue: [placeholder] ifFalse: [contents]) at: (self left + 10) @ (self top + 8)
			size: 14 bold: false color: (empty ifTrue: [Color mutedText] ifFalse: [Color text]).
		self hasFocus ifTrue: [| x |
			x := self left + 10 + (Canvas widthOf: contents size: 14).
			aCanvas line: x @ (self top + 7) to: x @ (self bottom - 7) color: Color text width: 1]]
! !

!WorldMorph methodsFor: 'initialization'!
initialize
	super initialize.
	bounds := 0 @ 0 extent: 800 @ 600.
	needsRedraw := true
! !

!WorldMorph methodsFor: 'accessing'!
world
	^self
!
focus
	^focus
!
focus: aMorph
	focus == aMorph ifTrue: [^self].
	focus ifNotNil: [:old | old changed].
	focus := aMorph.
	self changed
!
grabbed
	"The morph being dragged, if any."
	^grabbed
!
setNeedsRedraw
	needsRedraw := true
!
needsRedraw
	^needsRedraw
!
changed
	needsRedraw := true
! !

!WorldMorph methodsFor: 'opening'!
open: aMorph
	"Shows aMorph in Slip's World tab, and answers it."
	self show.
	self addMorph: aMorph.
	aMorph worldResized: bounds.
	^aMorph
!
show
	self primitiveShow.
	self extent: self displayExtent
!
primitiveShow
	<primitive: 'displayOpen'>
	^self error: 'There is no display here: the World opens only in Slip''s view.'
!
displayExtent
	<primitive: 'displaySize'>
	^bounds extent
! !

!WorldMorph methodsFor: 'drawing'!
drawOn: aCanvas
	aCanvas fillRect: bounds color: Color background
!
extentChanged
	submorphs copy do: [:each | each worldResized: bounds]
! !

!WorldMorph methodsFor: 'events'!
handle: anEvent on: aCanvas
	"The display's one way in: hands the event on, then draws on aCanvas if anything changed. Answers whether it drew."
	self dispatch: anEvent.
	needsRedraw ifFalse: [^false].
	needsRedraw := false.
	self fullDrawOn: aCanvas.
	^true
!
dispatch: anEvent
	| type |
	type := anEvent type.
	type == #resize ifTrue: [^self extent: anEvent position].
	type == #redraw ifTrue: [^self changed].
	type == #step ifTrue: [^self runSteps].
	type == #keyDown ifTrue: [^focus ifNotNil: [:morph | morph keyStroke: anEvent]].
	type == #wheel ifTrue: [^self wheelAt: anEvent].
	grabbed ifNotNil: [:morph | ^self drag: morph event: anEvent].
	type == #mouseDown ifTrue: [^self mouseDownAt: anEvent].
	pressed ifNil: [^self].
	type == #mouseMove ifTrue: [^pressed mouseMove: anEvent].
	type == #mouseUp ifTrue: [| morph | morph := pressed. pressed := nil. ^morph mouseUp: anEvent]
!
mouseDownAt: anEvent
	"The keyboard goes to the morph clicked, or the nearest owner that wants it. The click goes to the nearest that handles it; failing that, the nearest draggable one is picked up."
	| target morph |
	target := self morphAt: anEvent position.
	morph := target.
	[morph notNil and: [morph wantsKeyboardFocus not]] whileTrue: [morph := morph owner].
	self focus: morph.
	morph := target.
	[morph notNil and: [(morph handlesMouseDown: anEvent) not and: [morph isDraggable not]]] whileTrue: [morph := morph owner].
	morph ifNil: [^self].
	(morph handlesMouseDown: anEvent) ifTrue: [pressed := morph. ^morph mouseDown: anEvent].
	^self grab: morph event: anEvent
!
wheelAt: anEvent
	"The wheel goes to the nearest morph under the pointer that handles it."
	| morph |
	morph := self morphAt: anEvent position.
	[morph notNil and: [(morph handlesWheel: anEvent) not]] whileTrue: [morph := morph owner].
	morph ifNotNil: [morph wheel: anEvent]
!
grab: aMorph event: anEvent
	grabOwner := aMorph owner.
	grabIndex := grabOwner submorphs indexOf: aMorph.
	grabPosition := aMorph position.
	grabOffset := aMorph position - anEvent position.
	grabbed := aMorph.
	self addMorph: aMorph
!
drag: aMorph event: anEvent
	anEvent type == #mouseMove ifTrue: [^aMorph position: anEvent position + grabOffset].
	anEvent type == #mouseUp ifTrue: [^self drop: aMorph event: anEvent]
!
drop: aMorph event: anEvent
	"Gives aMorph to the nearest morph under it that wants it, or puts it back where it was."
	| target |
	grabbed := nil.
	target := self morphAt: anEvent position except: aMorph.
	[target notNil and: [(target wantsDroppedMorph: aMorph) not]] whileTrue: [target := target owner].
	target ifNotNil: [^target acceptDroppedMorph: aMorph event: anEvent].
	aMorph position: grabPosition.
	grabOwner addMorph: aMorph at: grabIndex
!
runSteps
	self allMorphsDo: [:each | (each ~~ self and: [each wantsSteps]) ifTrue: [each step]]
! !

Smalltalk at: #World put: WorldMorph new!
