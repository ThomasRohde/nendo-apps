"Slip kernel: Collection, the protocol every collection shares."!

!Collection class methodsFor: 'instance creation'!
with: anObject
	^self new add: anObject; yourself
!
with: first with: second
	^self new add: first; add: second; yourself
!
with: first with: second with: third
	^self new add: first; add: second; add: third; yourself
!
with: first with: second with: third with: fourth
	^self new add: first; add: second; add: third; add: fourth; yourself
!
withAll: aCollection
	^self new addAll: aCollection; yourself
! !

!Collection methodsFor: 'adding and removing'!
add: anObject
	^self subclassResponsibility
!
addAll: aCollection
	aCollection do: [:each | self add: each].
	^aCollection
!
remove: anObject
	^self remove: anObject ifAbsent: [self errorNotFound: anObject]
!
remove: anObject ifAbsent: aBlock
	^self subclassResponsibility
!
removeAll: aCollection
	aCollection do: [:each | self remove: each].
	^aCollection
! !

!Collection methodsFor: 'enumerating'!
do: aBlock
	^self subclassResponsibility
!
do: aBlock separatedBy: separatorBlock
	| first |
	first := true.
	self do: [:each |
		first ifFalse: [separatorBlock value].
		first := false.
		aBlock value: each]
!
collect: aBlock
	| result |
	result := OrderedCollection new.
	self do: [:each | result add: (aBlock value: each)].
	^result
!
select: aBlock
	| result |
	result := self species new.
	self do: [:each | (aBlock value: each) ifTrue: [result add: each]].
	^result
!
reject: aBlock
	^self select: [:each | (aBlock value: each) not]
!
detect: aBlock
	^self detect: aBlock ifNone: [NotFound new signal: 'No element satisfies the condition']
!
detect: aBlock ifNone: exceptionBlock
	self do: [:each | (aBlock value: each) ifTrue: [^each]].
	^exceptionBlock value
!
inject: thisValue into: binaryBlock
	| next |
	next := thisValue.
	self do: [:each | next := binaryBlock value: next value: each].
	^next
!
anySatisfy: aBlock
	self do: [:each | (aBlock value: each) ifTrue: [^true]].
	^false
!
allSatisfy: aBlock
	self do: [:each | (aBlock value: each) ifFalse: [^false]].
	^true
!
noneSatisfy: aBlock
	^(self anySatisfy: aBlock) not
!
count: aBlock
	| n |
	n := 0.
	self do: [:each | (aBlock value: each) ifTrue: [n := n + 1]].
	^n
!
occurrencesOf: anObject
	^self count: [:each | each = anObject]
!
detectMax: aBlock
	| best bestValue |
	self do: [:each | | v |
		v := aBlock value: each.
		(bestValue isNil or: [v > bestValue]) ifTrue: [best := each. bestValue := v]].
	^best
!
detectMin: aBlock
	| best bestValue |
	self do: [:each | | v |
		v := aBlock value: each.
		(bestValue isNil or: [v < bestValue]) ifTrue: [best := each. bestValue := v]].
	^best
! !

!Collection methodsFor: 'testing'!
isCollection
	^true
!
isEmpty
	^self size = 0
!
notEmpty
	^self isEmpty not
!
isNotEmpty
	^self isEmpty not
!
isEmptyOrNil
	^self isEmpty
!
includes: anObject
	self do: [:each | anObject = each ifTrue: [^true]].
	^false
!
ifEmpty: aBlock
	^self isEmpty ifTrue: [aBlock value] ifFalse: [self]
!
ifNotEmpty: aBlock
	^self isEmpty ifTrue: [self] ifFalse: [aBlock cull: self]
!
ifEmpty: emptyBlock ifNotEmpty: notEmptyBlock
	^self isEmpty ifTrue: [emptyBlock value] ifFalse: [notEmptyBlock cull: self]
! !

!Collection methodsFor: 'accessing'!
size
	| n |
	n := 0.
	self do: [:each | n := n + 1].
	^n
!
anyOne
	self do: [:each | ^each].
	^self errorEmpty
!
species
	^self class
! !

!Collection methodsFor: 'math'!
sum
	^self inject: 0 into: [:sum :each | sum + each]
!
sum: aBlock
	^self inject: 0 into: [:sum :each | sum + (aBlock value: each)]
!
max
	^self inject: self anyOne into: [:max :each | max max: each]
!
min
	^self inject: self anyOne into: [:min :each | min min: each]
!
average
	self isEmpty ifTrue: [^self errorEmpty].
	^self sum / self size
! !

!Collection methodsFor: 'converting'!
asArray
	| array i |
	array := Array new: self size.
	i := 0.
	self do: [:each | array at: (i := i + 1) put: each].
	^array
!
asOrderedCollection
	^OrderedCollection withAll: self
!
asSet
	^Set withAll: self
!
asSortedCollection
	^SortedCollection withAll: self
!
asSortedCollection: aBlock
	^(SortedCollection sortBlock: aBlock) addAll: self; yourself
! !

!Collection methodsFor: 'copying'!
copyWith: anObject
	^self copy add: anObject; yourself
!
copyWithout: anObject
	^self reject: [:each | each = anObject]
! !

!Collection methodsFor: 'printing'!
printOn: aStream
	super printOn: aStream.
	aStream nextPut: $(.
	self do: [:each | aStream print: each] separatedBy: [aStream space].
	aStream nextPut: $)
! !
