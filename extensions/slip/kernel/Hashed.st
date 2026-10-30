"Slip kernel: Set and Dictionary, hashed with open addressing over an Array. Elements and keys
are compared with = and placed by hash, so a class that redefines = redefines hash too."!

!HashedCollection class methodsFor: 'instance creation'!
new
	^self new: 8
!
new: anInteger
	^self basicNew setCapacity: anInteger
!
withAll: aCollection
	^(self new: aCollection size) addAll: aCollection; yourself
! !

!HashedCollection methodsFor: 'private'!
setCapacity: anInteger
	| size |
	size := 8.
	[size * 3 < (anInteger * 4)] whileTrue: [size := size * 2].
	array := Array new: size.
	tally := 0
!
growIfNeeded
	tally * 4 >= (array size * 3) ifTrue: [self rehashTo: array size * 2]
!
rehash
	self rehashTo: array size
!
rehashTo: newSize
	| old |
	old := array.
	array := Array new: newSize.
	tally := 0.
	old do: [:each | each isNil ifFalse: [self addInternal: each]]
!
addInternal: anElement
	array at: (self scanFor: (self keyOf: anElement)) put: anElement.
	tally := tally + 1
!
keyOf: anElement
	^anElement
!
scanFor: aKey
	"The index of the slot that holds aKey, or of the empty slot where it would go."
	| size start index probe |
	size := array size.
	start := aKey hash \\ size + 1.
	index := start.
	[probe := array at: index.
	 (probe isNil or: [(self keyOf: probe) = aKey]) ifTrue: [^index].
	 index := index \\ size + 1.
	 index = start] whileFalse.
	^self error: 'A hashed collection is full'
! !

!HashedCollection methodsFor: 'accessing'!
size
	^tally
!
isEmpty
	^tally = 0
! !

!HashedCollection methodsFor: 'copying'!
postCopy
	array := array collect: [:each | each isNil ifTrue: [nil] ifFalse: [self copyElement: each]]
!
copyElement: anElement
	^anElement
! !

!Set methodsFor: 'adding and removing'!
add: anObject
	| index |
	anObject isNil ifTrue: [^anObject].
	index := self scanFor: anObject.
	(array at: index) isNil ifTrue: [
		array at: index put: anObject.
		tally := tally + 1.
		self growIfNeeded].
	^anObject
!
remove: anObject ifAbsent: aBlock
	| index |
	anObject isNil ifTrue: [^aBlock value].
	index := self scanFor: anObject.
	(array at: index) isNil ifTrue: [^aBlock value].
	array at: index put: nil.
	self rehash.
	^anObject
! !

!Set methodsFor: 'testing'!
includes: anObject
	anObject isNil ifTrue: [^false].
	^(array at: (self scanFor: anObject)) notNil
! !

!Set methodsFor: 'enumerating'!
do: aBlock
	array do: [:each | each isNil ifFalse: [aBlock value: each]]
!
collect: aBlock
	| result |
	result := Set new: self size.
	self do: [:each | result add: (aBlock value: each)].
	^result
! !

!Set methodsFor: 'comparing'!
= aSet
	self == aSet ifTrue: [^true].
	self class == aSet class ifFalse: [^false].
	self size = aSet size ifFalse: [^false].
	^self allSatisfy: [:each | aSet includes: each]
!
hash
	^self size
! !

!Dictionary methodsFor: 'private'!
keyOf: anAssociation
	^anAssociation key
!
copyElement: anAssociation
	^anAssociation copy
! !

!Dictionary methodsFor: 'testing'!
isDictionary
	^true
!
includesKey: aKey
	^(array at: (self scanFor: aKey)) notNil
!
includes: aValue
	self do: [:each | each = aValue ifTrue: [^true]].
	^false
! !

!Dictionary methodsFor: 'accessing'!
at: aKey
	^self at: aKey ifAbsent: [self errorKeyNotFound: aKey]
!
at: aKey put: aValue
	| index association |
	index := self scanFor: aKey.
	association := array at: index.
	association isNil
		ifTrue: [
			array at: index put: (Association key: aKey value: aValue).
			tally := tally + 1.
			self growIfNeeded]
		ifFalse: [association value: aValue].
	^aValue
!
at: aKey ifAbsent: aBlock
	| association |
	association := array at: (self scanFor: aKey).
	association isNil ifTrue: [^aBlock value].
	^association value
!
at: aKey ifAbsentPut: aBlock
	^self at: aKey ifAbsent: [self at: aKey put: aBlock value]
!
at: aKey ifPresent: aBlock
	| association |
	association := array at: (self scanFor: aKey).
	association isNil ifTrue: [^nil].
	^aBlock cull: association value
!
at: aKey ifPresent: presentBlock ifAbsent: absentBlock
	| association |
	association := array at: (self scanFor: aKey).
	association isNil ifTrue: [^absentBlock value].
	^presentBlock cull: association value
!
add: anAssociation
	self at: anAssociation key put: anAssociation value.
	^anAssociation
!
keys
	| result i |
	result := Array new: tally.
	i := 0.
	self keysDo: [:key | result at: (i := i + 1) put: key].
	^result
!
values
	| result i |
	result := Array new: tally.
	i := 0.
	self do: [:value | result at: (i := i + 1) put: value].
	^result
!
associations
	| result i |
	result := Array new: tally.
	i := 0.
	self associationsDo: [:association | result at: (i := i + 1) put: association].
	^result
!
keyAtValue: aValue
	^self keyAtValue: aValue ifAbsent: [nil]
!
keyAtValue: aValue ifAbsent: aBlock
	self keysAndValuesDo: [:key :value | value = aValue ifTrue: [^key]].
	^aBlock value
!
errorKeyNotFound: aKey
	^NotFound new signal: 'Key not found: ', aKey printString
! !

!Dictionary methodsFor: 'removing'!
removeKey: aKey
	^self removeKey: aKey ifAbsent: [self errorKeyNotFound: aKey]
!
removeKey: aKey ifAbsent: aBlock
	| index association |
	index := self scanFor: aKey.
	association := array at: index.
	association isNil ifTrue: [^aBlock value].
	array at: index put: nil.
	self rehash.
	^association value
!
remove: anObject ifAbsent: aBlock
	^self shouldNotImplement
! !

!Dictionary methodsFor: 'enumerating'!
associationsDo: aBlock
	array do: [:each | each isNil ifFalse: [aBlock value: each]]
!
do: aBlock
	self associationsDo: [:association | aBlock value: association value]
!
keysDo: aBlock
	self associationsDo: [:association | aBlock value: association key]
!
valuesDo: aBlock
	self do: aBlock
!
keysAndValuesDo: aBlock
	self associationsDo: [:association | aBlock value: association key value: association value]
!
collect: aBlock
	| result |
	result := Dictionary new: self size.
	self keysAndValuesDo: [:key :value | result at: key put: (aBlock value: value)].
	^result
!
select: aBlock
	| result |
	result := Dictionary new.
	self keysAndValuesDo: [:key :value | (aBlock value: value) ifTrue: [result at: key put: value]].
	^result
!
keysSortedSafely
	^self keys asSortedCollection asArray
! !

!Dictionary methodsFor: 'comparing'!
= aDictionary
	self == aDictionary ifTrue: [^true].
	self class == aDictionary class ifFalse: [^false].
	self size = aDictionary size ifFalse: [^false].
	self keysAndValuesDo: [:key :value |
		((aDictionary includesKey: key) and: [(aDictionary at: key) = value]) ifFalse: [^false]].
	^true
!
hash
	^self size
! !

!Dictionary methodsFor: 'printing'!
printOn: aStream
	| first |
	aStream nextPutAll: 'a Dictionary('.
	first := true.
	self associationsDo: [:association |
		first ifFalse: [aStream space].
		first := false.
		aStream print: association].
	aStream nextPut: $)
! !
