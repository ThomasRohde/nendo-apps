"Slip kernel: Boolean, True and False."!

!Boolean methodsFor: 'testing'!
isBoolean
	^true
!
isLiteral
	^true
! !

!Boolean methodsFor: 'copying'!
shallowCopy
	^self
! !

!Boolean methodsFor: 'logical operations'!
eqv: aBoolean
	^self == aBoolean
!
xor: aBoolean
	^(self == aBoolean) not
! !

!True methodsFor: 'logical operations'!
& aBoolean
	^aBoolean
!
| aBoolean
	^true
!
not
	^false
!
and: aBlock
	^aBlock value
!
or: aBlock
	^true
! !

!True methodsFor: 'controlling'!
ifTrue: trueBlock
	^trueBlock value
!
ifFalse: falseBlock
	^nil
!
ifTrue: trueBlock ifFalse: falseBlock
	^trueBlock value
!
ifFalse: falseBlock ifTrue: trueBlock
	^trueBlock value
! !

!True methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'true'
! !

!False methodsFor: 'logical operations'!
& aBoolean
	^false
!
| aBoolean
	^aBoolean
!
not
	^true
!
and: aBlock
	^false
!
or: aBlock
	^aBlock value
! !

!False methodsFor: 'controlling'!
ifTrue: trueBlock
	^nil
!
ifFalse: falseBlock
	^falseBlock value
!
ifTrue: trueBlock ifFalse: falseBlock
	^falseBlock value
!
ifFalse: falseBlock ifTrue: trueBlock
	^falseBlock value
! !

!False methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'false'
! !
