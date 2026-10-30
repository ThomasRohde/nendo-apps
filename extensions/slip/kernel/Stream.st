"Slip kernel: streams over sequences, and the Transcript."!

!Stream methodsFor: 'accessing'!
next
	^self subclassResponsibility
!
atEnd
	^self subclassResponsibility
!
nextPut: anObject
	^self subclassResponsibility
!
nextPutAll: aCollection
	aCollection do: [:each | self nextPut: each].
	^aCollection
!
do: aBlock
	[self atEnd] whileFalse: [aBlock value: self next]
! !

!Stream methodsFor: 'writing'!
print: anObject
	anObject printOn: self
!
display: anObject
	anObject displayOn: self
!
<< anObject
	anObject displayOn: self
!
space
	self nextPut: Character space
!
tab
	self nextPut: Character tab
!
cr
	self nextPut: Character cr
!
lf
	self nextPut: Character lf
!
space: n
	n timesRepeat: [self space]
! !

!PositionableStream class methodsFor: 'instance creation'!
on: aCollection
	^self basicNew on: aCollection
! !

!PositionableStream methodsFor: 'private'!
on: aCollection
	collection := aCollection.
	position := 0.
	readLimit := aCollection size
! !

!PositionableStream methodsFor: 'accessing'!
position
	^position
!
position: anInteger
	(anInteger between: 0 and: readLimit) ifFalse: [^self errorSubscriptBounds: anInteger].
	position := anInteger
!
reset
	position := 0
!
skip: anInteger
	position := (position + anInteger max: 0) min: readLimit
!
atEnd
	^position >= readLimit
!
isEmpty
	^readLimit = 0
!
peek
	self atEnd ifTrue: [^nil].
	^collection at: position + 1
!
contents
	^collection copyFrom: 1 to: readLimit
!
collection
	^collection
! !

!ReadStream methodsFor: 'accessing'!
next
	self atEnd ifTrue: [^nil].
	position := position + 1.
	^collection at: position
!
next: anInteger
	| start stop |
	start := position + 1.
	stop := position + anInteger min: readLimit.
	position := stop.
	^collection copyFrom: start to: stop
!
upTo: anObject
	| stream element |
	stream := WriteStream on: (collection species new: 8).
	[self atEnd or: [(element := self next) = anObject]] whileFalse: [stream nextPut: element].
	^stream contents
!
upToEnd
	| start |
	start := position + 1.
	position := readLimit.
	^collection copyFrom: start to: readLimit
!
skipSeparators
	[self atEnd not and: [self peek isCharacter and: [self peek isSeparator]]] whileTrue: [self next]
! !

!WriteStream class methodsFor: 'instance creation'!
with: aCollection
	^(self on: aCollection) setToEnd
! !

!WriteStream methodsFor: 'private'!
on: aCollection
	super on: aCollection.
	readLimit := 0.
	writeLimit := aCollection size
!
setToEnd
	position := readLimit := writeLimit
!
growTo: anInteger
	| bigger |
	bigger := collection species new: ((anInteger max: collection size * 2) max: 16).
	bigger replaceFrom: 1 to: collection size with: collection startingAt: 1.
	collection := bigger.
	writeLimit := bigger size
! !

!WriteStream methodsFor: 'writing'!
nextPut: anObject
	position >= writeLimit ifTrue: [self growTo: position + 1].
	position := position + 1.
	collection at: position put: anObject.
	position > readLimit ifTrue: [readLimit := position].
	^anObject
!
nextPutAll: aCollection
	| n |
	(aCollection isKindOf: ArrayedCollection) ifFalse: [^super nextPutAll: aCollection].
	n := aCollection size.
	position + n > writeLimit ifTrue: [self growTo: position + n].
	collection replaceFrom: position + 1 to: position + n with: aCollection startingAt: 1.
	position := position + n.
	position > readLimit ifTrue: [readLimit := position].
	^aCollection
!
contents
	^collection copyFrom: 1 to: position
! !

!TranscriptStream methodsFor: 'writing'!
show: aString
	<primitive: 'transcriptShow'>
	^self show: aString displayString
!
nextPutAll: aString
	^self show: aString
!
nextPut: aCharacter
	^self show: (String with: aCharacter)
!
print: anObject
	^self show: anObject printString
!
display: anObject
	^self show: anObject displayString
!
<< anObject
	^self show: anObject displayString
!
cr
	^self show: (String with: Character lf)
!
lf
	^self cr
!
crShow: aString
	^self cr; show: aString
!
showCr: aString
	^self show: aString; cr
!
tab
	^self show: (String with: Character tab)
!
space
	^self show: (String with: Character space)
!
flush
	^self
!
endEntry
	^self
! !

!TranscriptStream methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'Transcript'
! !
