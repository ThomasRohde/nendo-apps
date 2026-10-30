"Slip kernel: OrderedCollection and SortedCollection, growable sequences over an Array."!

!OrderedCollection class methodsFor: 'instance creation'!
new
	^self new: 10
!
new: anInteger
	^self basicNew setCollection: (Array new: (anInteger max: 1))
!
withAll: aCollection
	^(self new: aCollection size) addAll: aCollection; yourself
! !

!OrderedCollection methodsFor: 'private'!
setCollection: anArray
	array := anArray.
	firstIndex := anArray size // 3 max: 1.
	lastIndex := firstIndex - 1
!
growAtLast
	| bigger |
	bigger := Array new: (array size * 2 max: 8).
	bigger replaceFrom: firstIndex to: lastIndex with: array startingAt: firstIndex.
	array := bigger
!
growAtFirst
	| bigger room |
	room := array size max: 8.
	bigger := Array new: array size + room.
	bigger replaceFrom: firstIndex + room to: lastIndex + room with: array startingAt: firstIndex.
	firstIndex := firstIndex + room.
	lastIndex := lastIndex + room.
	array := bigger
!
removeIndex: index
	| removed |
	removed := self at: index.
	array replaceFrom: firstIndex + index - 1 to: lastIndex - 1 with: array startingAt: firstIndex + index.
	array at: lastIndex put: nil.
	lastIndex := lastIndex - 1.
	^removed
!
insert: anObject before: absoluteIndex
	lastIndex = array size ifTrue: [self growAtLast].
	array replaceFrom: absoluteIndex + 1 to: lastIndex + 1 with: array startingAt: absoluteIndex.
	array at: absoluteIndex put: anObject.
	lastIndex := lastIndex + 1.
	^anObject
! !

!OrderedCollection methodsFor: 'accessing'!
size
	^lastIndex - firstIndex + 1
!
isEmpty
	^lastIndex < firstIndex
!
at: index
	(index isInteger and: [index between: 1 and: self size]) ifFalse: [^self errorSubscriptBounds: index].
	^array at: index + firstIndex - 1
!
at: index put: anObject
	(index isInteger and: [index between: 1 and: self size]) ifFalse: [^self errorSubscriptBounds: index].
	^array at: index + firstIndex - 1 put: anObject
! !

!OrderedCollection methodsFor: 'adding'!
add: anObject
	^self addLast: anObject
!
addLast: anObject
	lastIndex = array size ifTrue: [self growAtLast].
	lastIndex := lastIndex + 1.
	^array at: lastIndex put: anObject
!
addFirst: anObject
	firstIndex = 1 ifTrue: [self growAtFirst].
	firstIndex := firstIndex - 1.
	^array at: firstIndex put: anObject
!
add: anObject beforeIndex: index
	(index isInteger and: [index between: 1 and: self size + 1]) ifFalse: [^self errorSubscriptBounds: index].
	^self insert: anObject before: index + firstIndex - 1
!
addAllFirst: aCollection
	aCollection reverseDo: [:each | self addFirst: each].
	^aCollection
! !

!OrderedCollection methodsFor: 'removing'!
removeFirst
	| removed |
	self isEmpty ifTrue: [^self errorEmpty].
	removed := array at: firstIndex.
	array at: firstIndex put: nil.
	firstIndex := firstIndex + 1.
	^removed
!
removeLast
	| removed |
	self isEmpty ifTrue: [^self errorEmpty].
	removed := array at: lastIndex.
	array at: lastIndex put: nil.
	lastIndex := lastIndex - 1.
	^removed
!
removeFirst: n
	^(1 to: n) collect: [:i | self removeFirst]
!
removeLast: n
	^((1 to: n) collect: [:i | self removeLast]) reversed
!
remove: anObject ifAbsent: aBlock
	| index |
	index := self indexOf: anObject.
	index = 0 ifTrue: [^aBlock value].
	self removeIndex: index.
	^anObject
!
removeAll
	self setCollection: (Array new: 10)
!
removeAllSuchThat: aBlock
	| keep |
	keep := self reject: aBlock.
	self removeAll.
	self addAll: keep
! !

!OrderedCollection methodsFor: 'enumerating'!
do: aBlock
	firstIndex to: lastIndex do: [:i | aBlock value: (array at: i)]
!
collect: aBlock
	| result |
	result := OrderedCollection new: self size.
	self do: [:each | result addLast: (aBlock value: each)].
	^result
!
select: aBlock
	| result |
	result := self species new.
	self do: [:each | (aBlock value: each) ifTrue: [result add: each]].
	^result
!
reverseDo: aBlock
	lastIndex to: firstIndex by: -1 do: [:i | aBlock value: (array at: i)]
! !

!OrderedCollection methodsFor: 'copying'!
postCopy
	array := array copy
!
copyFrom: start to: stop
	| result |
	result := self species new: (stop - start + 1 max: 1).
	start to: stop do: [:i | result addLast: (self at: i)].
	^result
!
reversed
	| result |
	result := self species new: self size.
	self reverseDo: [:each | result addLast: each].
	^result
!
, aCollection
	^self copy addAll: aCollection; yourself
!
asArray
	| result |
	result := Array new: self size.
	result replaceFrom: 1 to: self size with: array startingAt: firstIndex.
	^result
! !

!OrderedCollection methodsFor: 'sorting'!
sort: aBlock
	| sorted |
	sorted := self asArray sort: aBlock.
	array replaceFrom: firstIndex to: lastIndex with: sorted startingAt: 1
! !

!SortedCollection class methodsFor: 'instance creation'!
new: anInteger
	^(super new: anInteger) setSortBlock: [:a :b | a <= b]
!
sortBlock: aBlock
	^(super new: 10) setSortBlock: aBlock
! !

!SortedCollection methodsFor: 'private'!
setSortBlock: aBlock
	sortBlock := aBlock
! !

!SortedCollection methodsFor: 'accessing'!
sortBlock
	^sortBlock
!
median
	^self at: self size + 1 // 2
! !

!SortedCollection methodsFor: 'adding'!
addAll: aCollection
	"Many at once: append them all and sort once."
	aCollection size > 8 ifFalse: [aCollection do: [:each | self add: each]. ^aCollection].
	aCollection do: [:each |
		lastIndex = array size ifTrue: [self growAtLast].
		lastIndex := lastIndex + 1.
		array at: lastIndex put: each].
	super sort: sortBlock.
	^aCollection
!
add: anObject
	| index |
	index := firstIndex.
	[index <= lastIndex and: [sortBlock value: (array at: index) value: anObject]] whileTrue: [index := index + 1].
	^self insert: anObject before: index
!
addFirst: anObject
	^self shouldNotImplement
!
addLast: anObject
	^self shouldNotImplement
!
at: index put: anObject
	^self shouldNotImplement
! !

!SortedCollection methodsFor: 'enumerating'!
collect: aBlock
	| result |
	result := OrderedCollection new: self size.
	self do: [:each | result addLast: (aBlock value: each)].
	^result
! !

!SortedCollection methodsFor: 'copying'!
copyFrom: start to: stop
	| result |
	result := OrderedCollection new: (stop - start + 1 max: 1).
	start to: stop do: [:i | result addLast: (self at: i)].
	^result
!
reversed
	| result |
	result := OrderedCollection new: self size.
	self reverseDo: [:each | result addLast: each].
	^result
! !
