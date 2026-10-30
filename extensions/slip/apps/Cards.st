"Cards: a board of cards in three columns, written in Smalltalk on Slip's morphs. Type a card and press Enter; drag a card to another column or to another place in its own; press x to remove one. The board is kept in this file with Slip keep:as:, so it is there again the next time Slip opens. Open it with: CardsBoard open"!

Morph subclass: #CardsBoard
	instanceVariableNames: 'columns field add status statusUntil'
	classVariableNames: ''
	package: 'Cards'!

Morph subclass: #CardsColumn
	instanceVariableNames: 'title'
	classVariableNames: ''
	package: 'Cards'!

Morph subclass: #CardsCard
	instanceVariableNames: 'text'
	classVariableNames: ''
	package: 'Cards'!

CardsBoard comment: 'A board of cards in three columns, kept in this file as the object named ''cards''. CardsBoard open shows it in the World tab.'!
CardsColumn comment: 'One column of a CardsBoard. Its submorphs are its cards, top to bottom; it takes a card dropped on it.'!
CardsCard comment: 'One card: its text, and a button that removes it. Drag it to move it.'!

!CardsBoard class methodsFor: 'opening'!
open
	"CardsBoard open"
	"The app fills the World, so it takes the World's place: what was open there closes."
	World removeAllMorphs.
	^World open: self new
!
keptName
	^'cards'
!
sampleState
	^#(#('Drag this card to Doing' 'Add a card: type it above, then press Enter') #('Read CardsBoard in the Browser') #('Open the Cards board'))
! !

!CardsBoard methodsFor: 'initialization'!
initialize
	super initialize.
	columns := #('To do' 'Doing' 'Done') collect: [:each | CardsColumn new title: each].
	columns do: [:each | self addMorph: each].
	field := TextFieldMorph new.
	field placeholder: 'A new card, then Enter'.
	field action: [:text | self addCard: text].
	self addMorph: field.
	add := ButtonMorph label: 'Add' action: [field accept].
	self addMorph: add.
	status := StringMorph contents: '' size: 13 bold: false.
	status color: #mutedText.
	self addMorph: status.
	self load
! !

!CardsBoard methodsFor: 'layout'!
worldResized: aRect
	self bounds: aRect.
	self layout
!
extentChanged
	self layout
!
layout
	| gap top width left |
	columns isNil ifTrue: [^self].
	field position: (self left + 110) @ (self top + 12).
	field extent: ((self width - 360) max: 160) @ 32.
	add position: (field right + 8) @ (self top + 12).
	status position: (add right + 12) @ (self top + 20).
	gap := 12.
	top := self top + 60.
	width := (self width - 32 - (gap * 2)) // 3 max: 120.
	left := self left + 16.
	columns do: [:each |
		each bounds: (left @ top extent: width @ ((self bottom - 16 - top) max: 100)).
		left := left + width + gap]
! !

!CardsBoard methodsFor: 'drawing'!
drawOn: aCanvas
	aCanvas fillRect: bounds color: Color background.
	aCanvas drawString: 'Cards' at: (self left + 16) @ (self top + 14) size: 22 bold: true color: Color text
! !

!CardsBoard methodsFor: 'cards'!
columns
	^columns
!
addCard: aString
	columns first addCard: (CardsCard text: aString) at: columns first cards size + 1.
	self keep
!
removeCard: aCard
	aCard owner ifNotNil: [:column | column removeCard: aCard].
	self keep
!
state
	"The texts of the cards, one Array for each column."
	^columns collect: [:each | each texts]
!
state: anArray
	columns withIndexDo: [:column :i | column texts: (i <= anArray size ifTrue: [anArray at: i] ifFalse: [#()])]
! !

!CardsBoard methodsFor: 'keeping'!
load
	| kept |
	kept := [Slip kept: self class keptName] on: Error do: [:e | nil].
	self state: ((kept isKindOf: Array) ifTrue: [kept] ifFalse: [self class sampleState])
!
keep
	[Slip keep: self state as: self class keptName.
	self say: 'Kept in this file.']
		on: Error do: [:e | self say: 'Not kept: ', e messageText]
!
say: aString
	status contents: aString.
	statusUntil := Time millisecondClockValue + 3000
! !

!CardsBoard methodsFor: 'stepping'!
wantsSteps
	^statusUntil notNil
!
step
	Time millisecondClockValue >= statusUntil ifFalse: [^self].
	statusUntil := nil.
	status contents: ''
! !

!CardsColumn methodsFor: 'accessing'!
title
	^title
!
title: aString
	title := aString.
	self changed
!
board
	^owner
!
cards
	^submorphs select: [:each | each isKindOf: CardsCard]
!
texts
	^(self cards collect: [:each | each text]) asArray
!
texts: aCollection
	self removeAllMorphs.
	aCollection do: [:each | self addMorph: (CardsCard text: each)].
	self layout
! !

!CardsColumn methodsFor: 'cards'!
addCard: aCard at: anIndex
	self addMorph: aCard at: anIndex.
	self layout
!
removeCard: aCard
	self removeMorph: aCard
!
removeMorph: aMorph
	"A card taken out, or picked up to be dragged: the others close up."
	super removeMorph: aMorph.
	self layout.
	^aMorph
!
layout
	| y |
	y := self top + 44.
	self cards do: [:each |
		each bounds: ((self left + 8) @ y extent: (self width - 16) @ 44).
		y := y + 52]
!
extentChanged
	self layout
! !

!CardsColumn methodsFor: 'dropping'!
wantsDroppedMorph: aMorph
	^aMorph isKindOf: CardsCard
!
acceptDroppedMorph: aCard event: anEvent
	"The card goes in above the first card whose middle is below the drop."
	self addCard: aCard at: (self cards count: [:each | each center y < anEvent position y]) + 1.
	self board ifNotNil: [:board | board keep]
! !

!CardsColumn methodsFor: 'drawing'!
drawOn: aCanvas
	aCanvas fillRoundRect: bounds radius: 10 color: Color panel.
	aCanvas drawString: title , '  ' , self cards size printString at: (self left + 14) @ (self top + 14) size: 14 bold: true color: Color mutedText
! !

!CardsCard class methodsFor: 'instance creation'!
text: aString
	^self new text: aString
! !

!CardsCard methodsFor: 'accessing'!
initialize
	super initialize.
	text := ''.
	self addMorph: ((ButtonMorph label: 'x' action: [self remove]) color: #mutedText; yourself)
!
text
	^text
!
text: aString
	text := aString.
	self changed
!
remove
	| column |
	column := owner.
	(column notNil and: [column board notNil]) ifTrue: [column board removeCard: self]
! !

!CardsCard methodsFor: 'layout'!
extentChanged
	submorphs first
		extent: 28 @ 28;
		position: (self right - 36) @ (self top + 8)
! !

!CardsCard methodsFor: 'events'!
isDraggable
	^true
! !

!CardsCard methodsFor: 'drawing'!
drawOn: aCanvas
	aCanvas fillRoundRect: bounds radius: 8 color: Color surface.
	aCanvas frameRect: bounds color: Color line width: 1.
	aCanvas clipTo: ((self left + 4) @ (self top + 4) corner: (self right - 44) @ (self bottom - 4)) during: [
		aCanvas drawString: text at: (self left + 12) @ (self top + 14) size: 14 bold: false color: Color text]
! !
